# Portal de Admissão

Sistema para a Mariana (RH) receber a documentação dos candidatos **sem precisar baixar e organizar nada na mão**.

- **Candidato** → recebe um link no WhatsApp, envia foto de cada documento pelo celular.
- **Mariana** → cria o candidato, manda o código, acompanha no painel e abre a pasta pronta no SharePoint.
- **SharePoint** → cada candidato ganha uma pasta `Nome - dd-mm-aaaa` com todos os arquivos.
- **Excel** → uma planilha no SharePoint guarda os candidatos, as configurações e a senha.

---

## 1. Testar agora (modo demonstração)

Não precisa configurar nada. Abra os arquivos no navegador:

| Página | Arquivo | Acesso |
|---|---|---|
| Portal do candidato | `index.html` | use o código que aparece na faixa amarela |
| Painel do RH | `admin.html` | senha **mariana123** |

No modo demonstração os dados ficam só no navegador (vêm 14 candidatos de exemplo).
Para voltar ao início, clique em “restaurar dados de exemplo” na faixa amarela do painel.

> Dica: se o navegador bloquear algo abrindo o arquivo direto, rode um servidor simples na pasta:
> `python3 -m http.server 8080` e acesse `http://localhost:8080`.

---

## 2. Estrutura

```
index.html              → portal do candidato
admin.html              → painel do RH (login, dashboard, candidatos)
assets/
  css/base.css          → cores, botões, componentes
  css/candidato.css     → telas do candidato
  css/admin.css         → painel
  js/config.js          → ⚙️ CONFIGURAÇÕES (empresas, cargos, documentos, link da API)
  js/utils.js           → funções compartilhadas (ícones, datas, fotos, WhatsApp)
  js/api.js             → comunicação com o Power Automate (e o modo demonstração)
  js/candidato.js       → lógica do portal do candidato
  js/admin.js           → lógica do painel
office-script/PortalAdmissao.ts → script da planilha Excel (vai em Automatizar → Office Scripts)
```

---

## 3. Ligar no Microsoft 365 (modo real)

Como funciona:

```
site ──► Power Automate ──► Office Script (planilha Excel)   → valida e grava os dados
                 │
                 ├──► SharePoint   → salva os arquivos, manda para a lixeira, renomeia pastas
                 └──► Outlook      → envia o código de “Esqueci a senha”
```

**Antes de começar:**
- O gatilho **“Quando uma solicitação HTTP for recebida”** é **premium**. Quem for dono do fluxo precisa de
  licença **Power Automate Premium** (ou *Process*). Sem ela, não dá para o site chamar o fluxo.
- Os **Office Scripts** precisam estar liberados pelo administrador do Microsoft 365 (costumam vir ligados).
- Faça tudo com a conta **dona dos documentos** (a que tem a licença).

### 3.1 Pasta e planilha no SharePoint

1. No site do SharePoint do RH (ex.: `https://suaempresa.sharepoint.com/sites/RH`), abra **Documentos**
   e crie a pasta `Integração – Documentos dos candidatos`.
2. Na mesma biblioteca (fora dessa pasta), crie uma pasta de trabalho do Excel vazia chamada **`Portal de Admissão.xlsx`**.
3. Anote o caminho da pasta **como aparece na barra do navegador**. Em sites em português a biblioteca
   “Documentos” costuma ter o endereço `Shared Documents`, então o caminho fica
   `/Shared Documents/Integração – Documentos dos candidatos`.

### 3.2 Script da planilha

1. Abra o `Portal de Admissão.xlsx` no **Excel para a Web** → guia **Automatizar** → **Novo script**.
2. Apague o conteúdo e cole todo o `office-script/PortalAdmissao.ts`.
3. No topo do script, ajuste:
   - `SITE_URL`: endereço do site, ex.: `'https://suaempresa.sharepoint.com/sites/RH'`
   - `PASTA_RAIZ`: o caminho anotado no passo 3.1, ex.: `'/Shared Documents/Integração – Documentos dos candidatos'`
4. Renomeie o script para **`PortalAdmissao`** e clique em **Salvar script**.

Não precisa rodar nada. Na primeira chamada, o script cria sozinho as abas `Candidatos` (visível) e
`Sessoes`, `Ajustes` e `Sistema` (ocultas), além da senha inicial **`troque-esta-senha`**.

### 3.3 Fluxo no Power Automate

Em **make.powerautomate.com** → **Criar** → **Fluxo da nuvem instantâneo** → pule a escolha do gatilho
e monte as etapas abaixo **nesta ordem**. Onde está escrito *expressão*, cole na aba **fx**.
Renomeie cada etapa exatamente como indicado (⋯ → Renomear), porque as expressões usam esses nomes.

| # | Etapa (nome) | Ação | Como preencher |
|---|---|---|---|
| 1 | *gatilho* | **Quando uma solicitação HTTP for recebida** | Quem pode disparar: **Qualquer pessoa**. Em ⋯ → Configurações: **Controle de simultaneidade** ligado, **grau de paralelismo 1** (um pedido por vez, como uma fila) |
| 2 | `Pedido` | **Compor** | expressão `json(triggerFormDataValue('pedido'))` |
| 3 | `Script` | **Excel Online (Business) → Executar script** | Local: o site · Biblioteca: Documentos · Arquivo: `Portal de Admissão.xlsx` · Script: `PortalAdmissao` · **acao**: expressão `outputs('Pedido')?['acao']` · **dados**: expressão `string(outputs('Pedido')?['dados'])` · **interno**: `Não` |
| 4 | *Inicializar variável* | **Inicializar variável** | Nome `resultado`, tipo **Cadeia de caracteres**, valor: expressão `outputs('Script')?['body/result']` |
| 5 | `Operacoes` | **Aplicar a cada** | Entrada: expressão `json(variables('resultado'))?['operacoes']`. Em Configurações: **Controle de simultaneidade** ligado, **grau 1** |
| 5a | ↳ `Tipo` | **Opção** (Switch), dentro do passo 5 | Em: expressão `items('Operacoes')?['tipo']` · crie os 3 casos abaixo |
| 5b | ↳ caso **`arquivo`** | **SharePoint → Criar arquivo** | Site: o site · Caminho da pasta: expressão `items('Operacoes')?['pasta']` · Nome: expressão `items('Operacoes')?['nome']` · Conteúdo: expressão `base64ToBinary(outputs('Pedido')?['arquivo'])` |
| 5c | ↳ caso **`sharepoint`** | **SharePoint → Enviar uma solicitação HTTP para o SharePoint** | Site: o site · Método: `POST` · Uri: expressão `items('Operacoes')?['uri']` · Cabeçalho `Accept`: `application/json;odata=nometadata` |
| | ↳ logo abaixo, `Ignorar erro` | **Compor** | Entrada: `ok`. Em ⋯ → **Configurar execução após**: marque **é bem-sucedido** e **falhou** (se o arquivo antigo já não existir, o fluxo segue normalmente) |
| 5d | ↳ caso **`email`** | **Office 365 Outlook → Enviar um email (V2)** | Para: expressão `items('Operacoes')?['para']` · Assunto: expressão `items('Operacoes')?['assunto']` · Corpo: expressão `items('Operacoes')?['corpo']` |
| 6 | `Depois` | **Condição** (fora do passo 5) | expressão `empty(json(variables('resultado'))?['depois'])` **é igual a** `false` |
| 6a | ↳ Verdadeiro: `Script2` | **Executar script** | Mesmo arquivo e script do passo 3 · **acao**: expressão `json(variables('resultado'))?['depois']?['acao']` · **dados**: expressão `string(json(variables('resultado'))?['depois']?['dados'])` · **interno**: `Sim` |
| 6b | ↳ Verdadeiro | **Definir variável** | `resultado` = expressão `outputs('Script2')?['body/result']` |
| 7 | `Resposta` | **Resposta** | Código `200` · Cabeçalhos `Content-Type: application/json` e `Access-Control-Allow-Origin: *` · Corpo: expressão `json(variables('resultado'))?['resposta']` |
| 8 | `Resposta erro` | **Resposta** | Mesmos cabeçalhos · Corpo: `{"ok":false,"erro":"Não conseguimos salvar agora. Tente de novo em instantes.","codigo":"SERVIDOR"}` · Em **Configurar execução após** (em relação à etapa `Depois`): marque só **falhou**, **foi ignorado** e **atingiu o tempo limite** |

> ⚠️ O corpo da `Resposta` precisa ser **só** o campo `resposta`. O resultado completo do script contém tarefas
> internas (como o código do e-mail de recuperação) que **não podem** voltar para o navegador.

Salve o fluxo. Abra de novo o gatilho e copie a **URL HTTP POST**.

### 3.4 Ligar o site

1. Abra `assets/js/config.js` e cole a URL em `API_URL: '...'`.
2. Abra o `admin.html`, entre com **`troque-esta-senha`** e, em **Configurações → Geral**,
   **troque a senha** e **cadastre o e-mail de recuperação**.
3. Cadastre um candidato de teste, envie uma foto pelo portal e confira se a pasta apareceu no SharePoint.

> Ao alterar o script depois, basta colar a nova versão no Excel e salvar. O fluxo continua o mesmo.

> **Perdeu a senha e não tem e-mail de recuperação?** No Excel, clique com o botão direito numa aba →
> **Reexibir** → `Sistema`, apague o valor da linha `senhaHash` e oculte a aba de novo.
> A senha volta a ser `troque-esta-senha`.

### Pasta por semana (opcional)
No script, mude `PASTA_POR_SEMANA: true` para organizar assim:
`Integração / Semana 08-09 a 14-09-2026 / João da Silva - 13-09-2026 /`

---

## 4. Personalizar (pelo painel, sem mexer em código)

Depois de instalado, **quem usa o painel faz tudo sozinho** em **Configurações** (menu lateral):

| Parte | O que dá para fazer |
|---|---|
| **Geral** | Nome e WhatsApp do RH · e-mail de recuperação · trocar a senha |
| **Empresas** | Adicionar, renomear (os candidatos antigos são atualizados juntos), desativar e remover |
| **Cargos e documentos** | Criar cargos · adicionar, renomear, reordenar e remover documentos · escrever a explicação · marcar obrigatório/opcional |
| **Mensagens** | Editar os textos de convite, cobrança e pedido de nova foto, com prévia ao vivo |

E nos detalhes de cada candidato há o botão **Editar** (nome, WhatsApp, empresa e cargo), sem trocar o código.

**Esqueci a senha:** na tela de entrada. Um código chega no e-mail de recuperação cadastrado em Configurações → Geral.
Por isso, **cadastre esse e-mail logo no primeiro acesso**.

> O `assets/js/config.js` agora só guarda os **valores iniciais** (usados até a primeira vez que alguém salvar pelo painel)
> e o endereço da API. As configurações salvas ficam na aba oculta **Ajustes** da planilha Excel.

A lista de documentos é gravada no candidato **no momento do cadastro**. Mudanças num cargo valem para os próximos cadastros;
para atualizar alguém já cadastrado, use **Editar** e marque “usar a lista atual”.

---

## 5. Pensado para quem tem pouca familiaridade com celular

- O link do WhatsApp **já entra direto** (não precisa digitar o código).
- **Um documento por tela**, letra grande, botões grandes.
- Botões **“Letra maior”** e **“Contraste”** no topo.
- **“Ouvir explicação”**: o celular lê a instrução em voz alta.
- Exemplo visual de **foto boa × foto ruim**.
- Antes de enviar, o sistema **avisa se a foto está escura ou tremida**.
- A foto é **reduzida antes do envio** (funciona bem em internet fraca).
- Se sair e voltar, **continua de onde parou**.
- Quem prefere pode ver a lista e **enviar em qualquer ordem**.

---

## 6. Segurança e LGPD

- O candidato **nunca** vê links do SharePoint, só envia arquivos.
- O painel exige senha; a sessão expira em 6 horas; após 10 tentativas erradas, o login bloqueia por 10 minutos.
- A senha **não** fica escrita na planilha: só uma versão embaralhada (hash SHA-256 com sal).
- Quem tiver acesso à planilha Excel vê os dados dos candidatos. **Compartilhe a planilha e a pasta só com o Departamento Pessoal.**
- A URL do fluxo funciona como uma chave: não publique em lugar aberto além do próprio site.
- Ao **excluir** um candidato, a pasta dele vai para a lixeira do SharePoint.
- Recomendado: definir um prazo para apagar documentos de quem não foi admitido.

## 7. Limites

- Cada chamada passa pelo Power Automate e pelo Excel, e leva **de 3 a 10 segundos**. O envio de um documento leva um pouco mais.
- O fluxo atende **um pedido por vez** (paralelismo 1), para dois envios não gravarem por cima um do outro.
- A Microsoft limita os Office Scripts rodados pelo Power Automate a **1.600 execuções por dia** por usuário.
  Cada envio de documento usa 2, e as outras ações usam 1. Dá com folga para dezenas de candidatos por semana.
- Fotos são comprimidas para ~300 KB; PDFs até 10 MB.
- As miniaturas no painel aparecem quando o navegador está logado no Microsoft 365 da empresa.
