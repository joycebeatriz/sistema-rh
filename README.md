# Portal de Admissão

Sistema para a Mariana (RH) receber a documentação dos candidatos **sem precisar baixar e organizar nada na mão**.

- **Candidato** → recebe um link no WhatsApp, envia foto de cada documento pelo celular.
- **Mariana** → cria o candidato, manda o código, acompanha no painel e abre a pasta pronta no SharePoint.
- **SharePoint** → cada candidato ganha uma pasta `Nome - dd-mm-aaaa` com todos os arquivos.
- **Excel** → uma planilha no SharePoint guarda os candidatos, as configurações e a senha.

---

## 1. Endereços

| Página | Endereço | Acesso |
|---|---|---|
| Portal do candidato | https://sistema-documentacao.vercel.app/ | código de 6 números enviado pelo RH |
| Painel do RH | https://sistema-documentacao.vercel.app/admin | e-mail e senha cadastrados (veja 3.4) |

O sistema só funciona depois de ligado ao Microsoft 365 (seção 3). Sem o `API_URL` no `config.js`,
o painel mostra “Sistema não configurado”.

🔒 **Nenhuma senha fica escrita neste repositório** (ele é público). As senhas ficam só na planilha
Excel, embaralhadas (hash), e cada pessoa cadastra ou troca a sua pelo painel.

---

## 2. Estrutura

```
index.html              → portal do candidato
admin.html              → painel do RH (login, dashboard, candidatos) · no site publicado: /admin
vercel.json             → endereços sem “.html” na Vercel (/admin em vez de /admin.html)
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
   - `ADMIN_INICIAL_EMAIL` e `ADMIN_INICIAL_SENHA`: o e-mail e a senha (mínimo 8 caracteres) do **primeiro administrador**.
     🔒 Preencha **só na cópia dentro do Excel**. **Nunca** coloque senha no arquivo do GitHub: o repositório é público.
4. Renomeie o script para **`PortalAdmissao`** e clique em **Salvar script**.

Não precisa rodar nada. Na primeira chamada, o script cria sozinho as abas `Candidatos` (visível) e
`Sessoes`, `Usuarios`, `Ajustes` e `Sistema` (ocultas). Ainda não há usuários: só o **primeiro login**
com exatamente o `ADMIN_INICIAL_EMAIL` e a `ADMIN_INICIAL_SENHA` cria o administrador (veja 3.4).
Se esses campos estiverem vazios, ninguém consegue entrar.

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
2. Abra o `/admin` e entre com o `ADMIN_INICIAL_EMAIL` e a `ADMIN_INICIAL_SENHA` que você colocou no script do Excel.
   Esse primeiro acesso **cria você como administrador**.
3. Volte ao script no Excel, **apague a senha** de `ADMIN_INICIAL_SENHA` (deixe `''`) e salve.
   Ela não é mais usada, e assim não fica escrita em lugar nenhum.
4. Em **Configurações → Usuários**, cadastre as outras pessoas (cada uma com e-mail, senha e
   o acesso **Administrador** ou **Somente leitura**).
5. Cadastre um candidato de teste, envie uma foto pelo portal e confira se a pasta apareceu no SharePoint.

> Ao alterar o script depois, basta colar a nova versão no Excel e salvar. O fluxo continua o mesmo.

> **Perdeu a senha?** Use **"Esqueci a senha"** na tela de entrada: um código chega no próprio e-mail
> de acesso da conta. Se ninguém mais tiver acesso de administrador, no Excel clique com o botão direito
> numa aba → **Reexibir** → `Usuarios`, apague a linha do usuário travado (ou todas as linhas para recomeçar
> do zero: preencha de novo `ADMIN_INICIAL_EMAIL` e `ADMIN_INICIAL_SENHA` no script e faça o primeiro acesso).

### Pasta por semana (opcional)
No script, mude `PASTA_POR_SEMANA: true` para organizar assim:
`Integração / Semana 08-09 a 14-09-2026 / João da Silva - 13-09-2026 /`

---

## 4. Personalizar (pelo painel, sem mexer em código)

Depois de instalado, **quem usa o painel faz tudo sozinho** em **Configurações** (menu lateral):

| Parte | O que dá para fazer |
|---|---|
| **Geral** | Nome e WhatsApp do RH · trocar a **sua** senha |
| **Usuários** *(só administradores)* | Adicionar pessoas, definir **Administrador** ou **Somente leitura**, ativar/desativar, redefinir senha e remover |
| **Empresas** | Adicionar, renomear (os candidatos antigos são atualizados juntos), desativar e remover |
| **Cargos e documentos** | Criar cargos · adicionar, renomear, reordenar e remover documentos · escrever a explicação · marcar obrigatório/opcional |
| **Mensagens** | Editar os textos de convite, cobrança e pedido de nova foto, com prévia ao vivo |

E nos detalhes de cada candidato há o botão **Editar** (nome, WhatsApp, empresa e cargo), sem trocar o código.

**Papéis de acesso:** cada pessoa entra com **o próprio e-mail e senha**.
- **Administrador:** faz tudo (cadastrar, editar, excluir, configurar e gerenciar usuários).
- **Somente leitura:** só visualiza o dashboard e os candidatos — sem nenhum botão de ação.

**Esqueci a senha:** na tela de entrada. Digite o seu e-mail e um código chega **nesse mesmo e-mail** (o de acesso).

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
- O painel exige e-mail + senha por pessoa, com papéis (**Administrador** / **Somente leitura**); a sessão expira em 6 horas; após 10 tentativas erradas, o login bloqueia por 10 minutos.
- As senhas **não** ficam escritas na planilha: só uma versão embaralhada (hash SHA-256 com sal), uma por usuário na aba oculta `Usuarios`.
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
