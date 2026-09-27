/**
 * =========================================================================
 *  PORTAL DE ADMISSÃO – API (Office Script do Excel)
 *
 *  Roda dentro da planilha "Portal de Admissão.xlsx", chamado pelo
 *  Power Automate a cada pedido do site:
 *   • guarda os candidatos na aba "Candidatos"
 *   • decide a pasta "Nome - dd-mm-aaaa" de cada candidato no SharePoint
 *   • devolve ao fluxo as tarefas que só ele consegue fazer
 *     (salvar arquivo, mandar para a lixeira, renomear pasta, enviar e-mail)
 *
 *  Passo a passo de instalação no README.md
 * =========================================================================
 */

const CONFIG = {
  // Endereço do site do SharePoint (copie da barra do navegador, sem a barra no final)
  SITE_URL: 'https://constate-my.sharepoint.com/personal/marianasilva_odilonsantos_com',
  // Pasta raiz dos documentos, a partir do site: /<biblioteca>/<pasta>
  PASTA_RAIZ: '/Documents/Sistema-RH',
  // 1º acesso: preencha os dois SÓ na cópia do script dentro do Excel, nunca aqui no GitHub.
  // Depois que o primeiro administrador entrar, eles deixam de ser usados (pode apagar).
  ADMIN_INICIAL_EMAIL: '',
  ADMIN_INICIAL_SENHA: '',
  FUSO_HORAS: -3,             // America/Sao_Paulo (sem horário de verão)
  SESSAO_HORAS: 6,
  PASTA_POR_SEMANA: false,    // true → Integração / Semana 08-09 a 14-09-2026 / Nome - Data
  TAMANHO_MAX_MB: 15,
};

const COLUNAS = ['codigo', 'nome', 'telefone', 'cargo', 'empresa', 'documentos', 'docs',
  'pasta', 'pastaUrl', 'criadoEm', 'atualizadoEm', 'concluidoEm'];
// Aba oculta "Usuarios": quem pode entrar no painel e com qual papel
const COLUNAS_USUARIOS = ['email', 'nome', 'senhaHash', 'sal', 'papel', 'ativo', 'criadoEm'];
const COLUNAS_JSON = ['documentos', 'docs'];
const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'application/pdf'];
const EXTENSOES: { [tipo: string]: string } = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };

/* ------------------------------------------------------------------------
   TIPOS
   ------------------------------------------------------------------------ */
interface Documento { id: string; nome: string; dica: string; icone: string; obrigatorio: boolean; }

interface DocEnviado {
  arquivoNome?: string; tipo?: string; caminho?: string; url?: string; miniatura?: string;
  enviadoEm?: string; pulado?: boolean; puladoEm?: string; reenviar?: boolean; pedidoEm?: string;
}

interface Candidato {
  codigo: string; nome: string; telefone: string; cargo: string; empresa: string;
  documentos: Documento[]; docs: { [id: string]: DocEnviado };
  pasta: string; pastaUrl: string; criadoEm: string; atualizadoEm: string; concluidoEm: string;
  _linha?: number;
}

interface CandidatoPublico {
  codigo: string; nome: string; cargo: string; empresa: string; documentos: Documento[];
  docs: { [id: string]: DocEnviado }; concluidoEm: string;
}

interface Cargo { id: string; nome: string; icone?: string; ativo?: boolean; documentos?: Documento[]; }

// Papéis de acesso ao painel: 'admin' (tudo) | 'leitura' (só visualiza)
interface Usuario { email: string; nome: string; papel: string; ativo: boolean; }
interface UsuarioLinha extends Usuario { senhaHash: string; sal: string; criadoEm: string; }
interface Sessao { email: string; papel: string; }

interface Ajustes {
  nomeRh?: string; whatsappRh?: string; emailRecuperacao?: string;
  empresas?: { nome: string; ativa?: boolean }[];
  cargos?: Cargo[];
  mensagens?: { convite?: string; cobranca?: string; novaFoto?: string };
}

interface Dados {
  codigo?: string; docId?: string; arquivo?: { tipo?: string; tamanho?: number };
  senha?: string; token?: string; senhaAtual?: string; novaSenha?: string;
  nome?: string; telefone?: string; cargo?: string; empresa?: string; documentos?: Documento[];
  ajustes?: Ajustes; renomear?: { de?: string; para?: string }[];
  // Login e gestão de usuários
  email?: string; emailAlvo?: string; papel?: string; ativo?: boolean;
  // Só nas ações internas (vindas do próprio fluxo)
  registro?: DocEnviado; pasta?: string; pastaUrl?: string;
}

interface RespostaDados {
  candidato?: Candidato | CandidatoPublico; candidatos?: Candidato[]; ajustes?: Ajustes;
  token?: string; email?: string; ok?: boolean; mensagem?: string;
  papel?: string; nome?: string; usuarios?: Usuario[];
}

// Tarefa para o Power Automate executar depois do script
interface Operacao {
  tipo: string;              // 'arquivo' | 'sharepoint' | 'email'
  pasta?: string; nome?: string;              // arquivo: criar em <pasta>/<nome>
  metodo?: string; uri?: string;              // sharepoint: chamada REST relativa ao site
  para?: string; assunto?: string; corpo?: string; // email
}

interface Resultado {
  resposta: { ok: boolean; dados?: RespostaDados; erro?: string; codigo?: string };
  operacoes: Operacao[];
  depois?: { acao: string; dados: Dados };
}

class Falha {
  mensagem: string;
  codigo: string;
  constructor(mensagem: string, codigo?: string) {
    this.mensagem = mensagem;
    this.codigo = codigo || 'NEGOCIO';
  }
}

/* ------------------------------------------------------------------------
   ENTRADA – chamada pelo Power Automate ("Executar script")
   ------------------------------------------------------------------------ */
function main(workbook: ExcelScript.Workbook, acao: string, dados: string, interno: boolean): string {
  const portal = new Portal(workbook);
  let resultado: Resultado;
  try {
    const d = JSON.parse(dados || '{}') as Dados;
    resultado = { resposta: { ok: true, dados: portal.executar(acao, d, !!interno) }, operacoes: portal.operacoes, depois: portal.depois };
  } catch (e) {
    let erro = String(e);
    let codigo = '';
    if (e instanceof Falha) {
      erro = e.mensagem;
      codigo = e.codigo;
    } else {
      if (e instanceof Error) erro = e.message;
      console.log(e);
    }
    resultado = { resposta: { ok: false, erro, codigo }, operacoes: [] };
  }
  return JSON.stringify(resultado);
}

class Portal {
  wb: ExcelScript.Workbook;
  operacoes: Operacao[] = [];
  depois: { acao: string; dados: Dados } | undefined = undefined;
  private sistema: { [chave: string]: string } | undefined = undefined;

  constructor(wb: ExcelScript.Workbook) {
    this.wb = wb;
  }

  /* ----------------------------------------------------------------------
     ROTAS
     ---------------------------------------------------------------------- */
  executar(acao: string, d: Dados, interno: boolean): RespostaDados {
    this.instalar();
    switch (acao) {
      case 'candidato.entrar': return { candidato: publico_(this.acharPorCodigo(d.codigo)) };
      case 'candidato.enviar': return this.enviarDocumento(d);
      case 'candidato.pular': return this.pularDocumento(d);
      case 'candidato.concluir': return this.concluir(d);

      case 'publico.ajustes': return this.ajustesPublicos();

      case 'admin.login': return this.login(d);
      case 'admin.esqueciSenha': return this.esqueciSenha(d);
      case 'admin.redefinirSenha': return this.redefinirSenha(d);
      // Leitura: qualquer usuário logado (admin ou somente leitura)
      case 'admin.listar': { const s = this.exigirSessao(d.token); return { candidatos: this.lerTodos().map((c) => limpar_(c)), ajustes: this.lerAjustes(), papel: s.papel }; }
      // Escrita: só administradores
      case 'admin.criar': this.exigirAdmin(d.token); return this.criarCandidato(d);
      case 'admin.editar': this.exigirAdmin(d.token); return this.editarCandidato(d);
      case 'admin.pedirReenvio': this.exigirAdmin(d.token); return this.pedirReenvio(d);
      case 'admin.excluir': this.exigirAdmin(d.token); return this.excluir(d);
      case 'admin.salvarAjustes': this.exigirAdmin(d.token); return this.salvarAjustes(d);
      // Trocar a própria senha: qualquer usuário logado
      case 'admin.trocarSenha': { const s = this.exigirSessao(d.token); return this.trocarSenha(d, s); }
      // Gestão de usuários: só administradores
      case 'admin.usuarios.listar': this.exigirAdmin(d.token); return { usuarios: this.lerUsuarios() };
      case 'admin.usuarios.criar': this.exigirAdmin(d.token); return this.criarUsuario(d);
      case 'admin.usuarios.editar': this.exigirAdmin(d.token); return this.editarUsuario(d);
      case 'admin.usuarios.senha': this.exigirAdmin(d.token); return this.redefinirSenhaUsuario(d);
      case 'admin.usuarios.remover': this.exigirAdmin(d.token); return this.removerUsuario(d);

      case 'interno.registrarEnvio':
        if (!interno) throw new Falha('Ação inválida.');
        return this.registrarEnvio(d);

      case 'ping': return { mensagem: 'API do Portal de Admissão funcionando.' };
    }
    throw new Falha('Ação inválida.');
  }

  /* ----------------------------------------------------------------------
     CANDIDATO
     ---------------------------------------------------------------------- */
  // 1ª etapa: valida e pede ao fluxo para salvar o arquivo.
  // Só depois que o arquivo está no SharePoint o fluxo chama interno.registrarEnvio.
  enviarDocumento(d: Dados): RespostaDados {
    const c = this.acharPorCodigo(d.codigo);
    if (c.concluidoEm) throw new Falha('Seus documentos já foram finalizados. Se precisar mudar algo, fale com o RH.');

    const doc = (c.documentos || []).find((x) => x.id === d.docId);
    if (!doc) throw new Falha('Documento inválido.');

    const arq = d.arquivo || {};
    const tipo = String(arq.tipo || '');
    if (TIPOS_ACEITOS.indexOf(tipo) === -1) throw new Falha('Tipo de arquivo não aceito. Envie uma foto ou um PDF.');
    const tamanho = Number(arq.tamanho || 0);
    if (!tamanho) throw new Falha('O arquivo chegou vazio. Tente de novo.');
    if (tamanho > CONFIG.TAMANHO_MAX_MB * 1024 * 1024) throw new Falha(`Arquivo muito grande (máximo ${CONFIG.TAMANHO_MAX_MB} MB).`);

    const pasta = c.pasta || this.novaPasta(c.nome);

    // Se já existia um arquivo para este documento, manda o antigo para a lixeira
    const anterior = c.docs[doc.id];
    if (anterior && anterior.caminho) this.lixeira('File', anterior.caminho);

    const nomeArquivo = nomeSeguro_(`${doc.nome} - ${c.nome}.${EXTENSOES[tipo]}`);
    const caminho = `${pasta}/${nomeArquivo}`;
    this.operacoes.push({ tipo: 'arquivo', pasta, nome: nomeArquivo });

    this.depois = {
      acao: 'interno.registrarEnvio',
      dados: {
        codigo: c.codigo,
        docId: doc.id,
        pasta,
        pastaUrl: urlDe_(pasta),
        registro: { arquivoNome: nomeArquivo, tipo, caminho, url: urlDe_(caminho), miniatura: miniaturaDe_(caminho) },
      },
    };
    return { ok: true };
  }

  // 2ª etapa: o arquivo já foi salvo pelo fluxo
  registrarEnvio(d: Dados): RespostaDados {
    const c = this.acharPorCodigo(d.codigo);
    const r = d.registro || {};
    c.pasta = String(d.pasta || c.pasta);
    c.pastaUrl = String(d.pastaUrl || c.pastaUrl);
    c.docs[String(d.docId)] = {
      arquivoNome: r.arquivoNome, tipo: r.tipo, caminho: r.caminho, url: r.url, miniatura: r.miniatura,
      enviadoEm: agora_(),
    };
    c.atualizadoEm = agora_();
    this.salvar(c);
    return { candidato: publico_(c) };
  }

  pularDocumento(d: Dados): RespostaDados {
    const c = this.acharPorCodigo(d.codigo);
    const doc = (c.documentos || []).find((x) => x.id === d.docId);
    if (!doc || doc.obrigatorio) throw new Falha('Este documento é obrigatório.');
    c.docs[doc.id] = { pulado: true, enviadoEm: '', puladoEm: agora_() };
    c.atualizadoEm = agora_();
    this.salvar(c);
    return { candidato: publico_(c) };
  }

  concluir(d: Dados): RespostaDados {
    const c = this.acharPorCodigo(d.codigo);
    const faltando = this.obrigatoriosFaltando(c);
    if (faltando.length) throw new Falha('Ainda faltam documentos obrigatórios: ' + faltando.map((f) => f.nome).join(', '));
    c.concluidoEm = c.concluidoEm || agora_();
    c.atualizadoEm = agora_();
    this.salvar(c);
    return { candidato: publico_(c) };
  }

  obrigatoriosFaltando(c: Candidato): Documento[] {
    return (c.documentos || []).filter((doc) => {
      const x = c.docs[doc.id];
      return doc.obrigatorio && !(x && x.enviadoEm && !x.reenviar);
    });
  }

  /* ----------------------------------------------------------------------
     ADMIN
     ---------------------------------------------------------------------- */
  login(d: Dados): RespostaDados {
    const agora = Date.now();
    const email = normalizarEmail_(d.email);
    const senha = String(d.senha || '');
    const bloqueioAte = Date.parse(this.lerSistema('loginBloqueioAte') || '') || 0;
    const tentativas = bloqueioAte > agora ? Number(this.lerSistema('loginFalhas') || 0) : 0;
    if (tentativas >= 10) throw new Falha('Muitas tentativas. Aguarde 10 minutos e tente de novo.');
    if (!email) throw new Falha('Informe o seu e-mail.');

    const linhas = this.linhasUsuarios();
    let usuario = linhas.find((u) => u.email === email);

    // 1º acesso: sem nenhum usuário ainda. Só entra quem digitar exatamente o
    // ADMIN_INICIAL_EMAIL e a ADMIN_INICIAL_SENHA preenchidos no script do Excel.
    if (linhas.length === 0) {
      const emailInicial = normalizarEmail_(CONFIG.ADMIN_INICIAL_EMAIL);
      if (!emailInicial || CONFIG.ADMIN_INICIAL_SENHA.length < 8) {
        throw new Falha('Primeiro acesso não configurado. Preencha ADMIN_INICIAL_EMAIL e ADMIN_INICIAL_SENHA (mínimo 8 caracteres) no script do Excel.');
      }
      if (email !== emailInicial || senha !== CONFIG.ADMIN_INICIAL_SENHA) {
        this.registrarFalhaLogin(agora, tentativas);
        throw new Falha('E-mail ou senha incorretos.');
      }
      this.gravarUsuario({ email, nome: 'Administrador', papel: 'admin', ativo: true }, senha);
      usuario = this.linhasUsuarios().find((u) => u.email === email);
    }

    if (!usuario || usuario.ativo === false || !this.senhaConfereUsuario(usuario, senha)) {
      this.registrarFalhaLogin(agora, tentativas);
      throw new Falha('E-mail ou senha incorretos.');
    }

    this.gravarSistema('loginFalhas', '0');
    const token = aleatorioHex_(32);
    const aba = this.aba('Sessoes', ['token', 'expira', 'email', 'papel']);
    const validas = this.linhas(aba)
      .filter((l) => l[0] && Date.parse(String(l[1])) > agora)
      .map((l) => [String(l[0]), String(l[1]), String(l[2] || ''), String(l[3] || '')]);
    validas.push([token, new Date(agora + CONFIG.SESSAO_HORAS * 3600e3).toISOString(), usuario.email, usuario.papel]);
    this.reescrever(aba, 2, validas);
    return { token, papel: usuario.papel, nome: usuario.nome, email: usuario.email };
  }

  private registrarFalhaLogin(agora: number, tentativas: number) {
    this.gravarSistema('loginFalhas', String(tentativas + 1));
    this.gravarSistema('loginBloqueioAte', new Date(agora + 10 * 60e3).toISOString());
  }

  exigirSessao(token?: string): Sessao {
    const linha = !token ? undefined : this.linhas(this.aba('Sessoes', ['token', 'expira', 'email', 'papel']))
      .find((l) => String(l[0]) === token && Date.parse(String(l[1])) > Date.now());
    if (!linha) throw new Falha('Sua sessão expirou. Entre novamente.', 'SESSAO');
    return { email: String(linha[2] || ''), papel: String(linha[3] || 'admin') };
  }

  exigirAdmin(token?: string): Sessao {
    const s = this.exigirSessao(token);
    if (s.papel !== 'admin') throw new Falha('Esta ação é só para administradores.', 'PERMISSAO');
    return s;
  }

  criarCandidato(d: Dados): RespostaDados {
    const nome = String(d.nome || '').trim();
    if (!nome) throw new Falha('Informe o nome do candidato.');
    if (!Array.isArray(d.documentos) || !d.documentos.length) throw new Falha('Lista de documentos vazia.');

    const todos = this.lerTodos();
    let codigo: string;
    do codigo = String(100000 + Math.floor(Math.random() * 900000));
    while (todos.some((c) => c.codigo === codigo));

    const c: Candidato = {
      codigo,
      nome,
      telefone: String(d.telefone || '').replace(/\D/g, ''),
      cargo: String(d.cargo || ''),
      empresa: String(d.empresa || ''),
      documentos: limparDocumentos_(d.documentos),
      docs: {},
      pasta: '',
      pastaUrl: '',
      criadoEm: agora_(),
      atualizadoEm: agora_(),
      concluidoEm: '',
    };
    const aba = this.abaCandidatos();
    const usado = aba.getUsedRange(true);
    c._linha = usado ? usado.getRowIndex() + usado.getRowCount() + 1 : 2;
    this.salvar(c);
    return { candidato: limpar_(c) };
  }

  editarCandidato(d: Dados): RespostaDados {
    const c = this.acharPorCodigo(d.codigo);
    const nome = String(d.nome || '').trim();
    if (!nome) throw new Falha('Informe o nome do candidato.');

    const nomeAntigo = c.nome;
    c.nome = nome;
    c.telefone = String(d.telefone || '').replace(/\D/g, '');
    c.empresa = String(d.empresa || '');
    c.cargo = String(d.cargo || c.cargo);
    // Documentos já enviados continuam guardados em c.docs, mesmo que saiam da lista
    if (Array.isArray(d.documentos) && d.documentos.length) c.documentos = limparDocumentos_(d.documentos);

    if (this.obrigatoriosFaltando(c).length) c.concluidoEm = '';

    if (nomeAntigo !== nome && c.pasta) {
      const corte = c.pasta.lastIndexOf('/');
      const novaPasta = c.pasta.slice(0, corte + 1) + nomeSeguro_(c.pasta.slice(corte + 1).replace(nomeAntigo, nome));
      if (novaPasta !== c.pasta) {
        this.operacoes.push({
          tipo: 'sharepoint',
          metodo: 'POST',
          uri: `_api/web/GetFolderByServerRelativeUrl('${odata_(caminhoServidor_(c.pasta))}')/moveto(newurl='${odata_(caminhoServidor_(novaPasta))}')`,
        });
        // Atualiza os links dos arquivos que estão dentro da pasta
        Object.keys(c.docs).forEach((id) => {
          const x = c.docs[id];
          if (x.caminho && x.caminho.indexOf(c.pasta + '/') === 0) {
            x.caminho = novaPasta + x.caminho.slice(c.pasta.length);
            x.url = urlDe_(x.caminho);
            x.miniatura = miniaturaDe_(x.caminho);
          }
        });
        c.pasta = novaPasta;
        c.pastaUrl = urlDe_(novaPasta);
      }
    }

    c.atualizadoEm = agora_();
    this.salvar(c);
    return { candidato: limpar_(c) };
  }

  pedirReenvio(d: Dados): RespostaDados {
    const c = this.acharPorCodigo(d.codigo);
    const docId = String(d.docId || '');
    const anterior = c.docs[docId];
    if (anterior && anterior.caminho) this.lixeira('File', anterior.caminho);
    c.docs[docId] = { reenviar: true, pedidoEm: agora_() };
    c.concluidoEm = '';
    c.atualizadoEm = agora_();
    this.salvar(c);
    return { candidato: limpar_(c) };
  }

  excluir(d: Dados): RespostaDados {
    const c = this.acharPorCodigo(d.codigo);
    if (c.pasta) this.lixeira('Folder', c.pasta);
    this.abaCandidatos().getRange(`${c._linha}:${c._linha}`).delete(ExcelScript.DeleteShiftDirection.up);
    return { ok: true };
  }

  /* ----------------------------------------------------------------------
     CONFIGURAÇÕES (editadas pelo painel) E SENHA
     ---------------------------------------------------------------------- */
  // Aba "Ajustes": o JSON fica em pedaços na coluna A (cada célula aceita no máximo 32.767 caracteres)
  lerAjustes(): Ajustes | undefined {
    try {
      const texto = this.linhas(this.abaAjustes(), 1).map((l) => String(l[0] || '')).join('');
      return texto ? (JSON.parse(texto) as Ajustes) : undefined;
    } catch (e) {
      return undefined;
    }
  }

  gravarAjustes(ajustes: Ajustes) {
    const aba = this.abaAjustes();
    const texto = JSON.stringify(ajustes);
    const pedacos: string[][] = [];
    for (let i = 0; i < texto.length; i += 30000) pedacos.push([texto.slice(i, i + 30000)]);
    aba.getRange('A:A').clear(ExcelScript.ClearApplyTo.contents);
    aba.getRange(`A1:A${pedacos.length}`).setValues(pedacos);
  }

  ajustesPublicos(): RespostaDados {
    const a = this.lerAjustes() || {};
    return {
      ajustes: {
        nomeRh: a.nomeRh || '',
        whatsappRh: a.whatsappRh || '',
        cargos: (a.cargos || []).map((c) => ({ id: c.id, nome: c.nome })),
      },
    };
  }

  salvarAjustes(d: Dados): RespostaDados {
    const ajustes = limparAjustes_(d.ajustes || {});

    // Renomear empresa → atualiza todos os candidatos de uma vez
    const mapa: { [de: string]: string } = {};
    (d.renomear || []).forEach((r) => {
      const de = String(r.de || '');
      const para = String(r.para || '').trim();
      if (de && para && de !== para) mapa[de] = para;
    });
    if (Object.keys(mapa).length) {
      const aba = this.abaCandidatos();
      const usado = aba.getUsedRange(true);
      const linhas = usado ? usado.getRowIndex() + usado.getRowCount() - 1 : 0;
      if (linhas > 0) {
        const coluna = letra_(COLUNAS.indexOf('empresa'));
        const faixa = aba.getRange(`${coluna}2:${coluna}${linhas + 1}`);
        faixa.setValues(faixa.getValues().map((l) => {
          const v = String(l[0]);
          return [mapa[v] !== undefined ? mapa[v] : v];
        }));
      }
    }

    this.gravarAjustes(ajustes);
    return { ajustes, candidatos: this.lerTodos().map((c) => limpar_(c)) };
  }

  // Cada pessoa troca a própria senha (sabemos quem é pela sessão)
  trocarSenha(d: Dados, sessao: Sessao): RespostaDados {
    const u = this.acharUsuarioLinha(sessao.email);
    if (!u) throw new Falha('Usuário não encontrado.');
    if (!this.senhaConfereUsuario(u.usuario, String(d.senhaAtual || ''))) throw new Falha('A senha atual está incorreta.');
    this.definirSenhaUsuario(u.linha, String(d.novaSenha || ''));
    return { ok: true };
  }

  // "Esqueci a senha": o código vai para o e-mail da própria conta
  esqueciSenha(d: Dados): RespostaDados {
    const email = normalizarEmail_(d.email);
    if (!email) throw new Falha('Informe o seu e-mail.');
    const enviadaEm = Date.parse(this.lerSistema('recuperacaoEnviadaEm') || '') || 0;
    if (Date.now() - enviadaEm < 60e3) throw new Falha('Já enviamos um código há pouco. Confira o e-mail (e a caixa de spam).');

    const alvo = this.linhasUsuarios().find((u) => u.email === email && u.ativo !== false);
    if (!alvo) throw new Falha('Não encontramos uma conta ativa com esse e-mail.');

    const codigo = String(100000 + Math.floor(Math.random() * 900000));
    this.gravarSistema('recuperacaoEmail', email);
    this.gravarSistema('recuperacaoCodigo', codigo);
    this.gravarSistema('recuperacaoValidade', new Date(Date.now() + 15 * 60e3).toISOString());
    this.gravarSistema('recuperacaoFalhas', '0');
    this.gravarSistema('recuperacaoEnviadaEm', agora_());
    this.operacoes.push({
      tipo: 'email',
      para: email,
      assunto: 'Código para redefinir a senha – Portal de Admissão',
      corpo: `Seu código para criar uma nova senha é: <b>${codigo}</b><br><br>Ele vale por 15 minutos. Se não foi você que pediu, ignore este e-mail.`,
    });

    const partes = email.split('@');
    return { email: `${partes[0].slice(0, 2)}***@${partes[1] || ''}` };
  }

  redefinirSenha(d: Dados): RespostaDados {
    const tentativas = Number(this.lerSistema('recuperacaoFalhas') || 0);
    if (tentativas >= 5) throw new Falha('Muitas tentativas. Peça um novo código.');
    const codigo = this.lerSistema('recuperacaoCodigo');
    const valido = Date.parse(this.lerSistema('recuperacaoValidade') || '') > Date.now();
    if (!codigo || !valido || String(d.codigo || '').replace(/\D/g, '') !== codigo) {
      this.gravarSistema('recuperacaoFalhas', String(tentativas + 1));
      throw new Falha('Código inválido ou vencido.');
    }
    const u = this.acharUsuarioLinha(this.lerSistema('recuperacaoEmail'));
    if (!u) throw new Falha('Conta não encontrada. Peça um novo código.');
    this.definirSenhaUsuario(u.linha, String(d.novaSenha || ''));
    this.gravarSistema('recuperacaoCodigo', '');
    this.gravarSistema('recuperacaoEmail', '');
    this.gravarSistema('recuperacaoFalhas', '0');
    return { ok: true };
  }

  /* ----------------------------------------------------------------------
     USUÁRIOS DO PAINEL (aba oculta "Usuarios")
     ---------------------------------------------------------------------- */
  // Lista pública (sem hash nem sal) para o painel
  lerUsuarios(): Usuario[] {
    return this.linhasUsuarios().map((u) => ({ email: u.email, nome: u.nome, papel: u.papel, ativo: u.ativo }));
  }

  // Linhas cruas da aba, com email já normalizado
  private linhasUsuarios(): UsuarioLinha[] {
    return this.linhas(this.aba('Usuarios', COLUNAS_USUARIOS)).filter((l) => l[0]).map((l) => ({
      email: normalizarEmail_(String(l[0])),
      nome: String(l[1] || ''),
      senhaHash: String(l[2] || ''),
      sal: String(l[3] || ''),
      papel: String(l[4] || 'leitura') === 'admin' ? 'admin' : 'leitura',
      ativo: String(l[5] || 'sim').toLowerCase() !== 'nao',
      criadoEm: String(l[6] || ''),
    }));
  }

  private acharUsuarioLinha(email?: string): { usuario: UsuarioLinha; linha: number } | undefined {
    const alvo = normalizarEmail_(email);
    if (!alvo) return undefined;
    const todas = this.linhasUsuarios();
    const idx = todas.findIndex((u) => u.email === alvo);
    return idx === -1 ? undefined : { usuario: todas[idx], linha: idx + 2 };
  }

  private reescreverUsuarios(lista: UsuarioLinha[]) {
    const aba = this.aba('Usuarios', COLUNAS_USUARIOS);
    this.reescrever(aba, 2, lista.map((u) => [u.email, u.nome, u.senhaHash, u.sal, u.papel,
      u.ativo === false ? 'nao' : 'sim', u.criadoEm || agora_()]));
  }

  criarUsuario(d: Dados): RespostaDados {
    const email = normalizarEmail_(d.email);
    const nome = String(d.nome || '').trim();
    const papel = String(d.papel || 'leitura') === 'admin' ? 'admin' : 'leitura';
    if (!validarEmail_(email)) throw new Falha('E-mail inválido.');
    if (!nome) throw new Falha('Informe o nome do usuário.');
    if (this.acharUsuarioLinha(email)) throw new Falha('Já existe um usuário com esse e-mail.');
    this.gravarUsuario({ email, nome, papel, ativo: true }, String(d.novaSenha || ''));
    return { usuarios: this.lerUsuarios() };
  }

  editarUsuario(d: Dados): RespostaDados {
    const alvo = this.acharUsuarioLinha(d.emailAlvo);
    if (!alvo) throw new Falha('Usuário não encontrado.');
    const nome = String(d.nome || alvo.usuario.nome).trim();
    const papel = d.papel === undefined ? alvo.usuario.papel : (String(d.papel) === 'admin' ? 'admin' : 'leitura');
    const ativo = d.ativo === undefined ? alvo.usuario.ativo : !!d.ativo;
    // Não deixar o sistema ficar sem nenhum administrador ativo
    if ((papel !== 'admin' || !ativo) && alvo.usuario.papel === 'admin' && alvo.usuario.ativo) {
      const outrosAdmins = this.linhasUsuarios().filter((u) => u.papel === 'admin' && u.ativo && u.email !== alvo.usuario.email);
      if (!outrosAdmins.length) throw new Falha('É preciso manter ao menos um administrador ativo.');
    }
    const aba = this.aba('Usuarios', COLUNAS_USUARIOS);
    aba.getRange(`B${alvo.linha}`).setValue(nome);
    aba.getRange(`E${alvo.linha}`).setValue(papel);
    aba.getRange(`F${alvo.linha}`).setValue(ativo ? 'sim' : 'nao');
    return { usuarios: this.lerUsuarios() };
  }

  redefinirSenhaUsuario(d: Dados): RespostaDados {
    const alvo = this.acharUsuarioLinha(d.emailAlvo);
    if (!alvo) throw new Falha('Usuário não encontrado.');
    this.definirSenhaUsuario(alvo.linha, String(d.novaSenha || ''));
    return { ok: true };
  }

  removerUsuario(d: Dados): RespostaDados {
    const alvo = this.acharUsuarioLinha(d.emailAlvo);
    if (!alvo) throw new Falha('Usuário não encontrado.');
    if (alvo.usuario.papel === 'admin' && alvo.usuario.ativo) {
      const outrosAdmins = this.linhasUsuarios().filter((u) => u.papel === 'admin' && u.ativo && u.email !== alvo.usuario.email);
      if (!outrosAdmins.length) throw new Falha('É preciso manter ao menos um administrador ativo.');
    }
    const restantes = this.linhasUsuarios().filter((u) => u.email !== alvo.usuario.email);
    this.reescreverUsuarios(restantes);
    return { usuarios: this.lerUsuarios() };
  }

  // Cria ou substitui a linha de um usuário, gravando o hash da senha
  private gravarUsuario(u: Usuario, senha: string) {
    if (senha.length < 6) throw new Falha('A senha precisa ter pelo menos 6 caracteres.');
    const sal = aleatorioHex_(16);
    const hash = sha256_(sal + senha);
    const aba = this.aba('Usuarios', COLUNAS_USUARIOS);
    const existente = this.acharUsuarioLinha(u.email);
    const linha = existente ? existente.linha : (this.linhasUsuarios().length + 2);
    aba.getRange(`A${linha}:${letra_(COLUNAS_USUARIOS.length - 1)}${linha}`)
      .setValues([[u.email, u.nome, hash, sal, u.papel, u.ativo === false ? 'nao' : 'sim', agora_()]]);
  }

  // Troca só a senha (hash + sal) de uma linha existente
  private definirSenhaUsuario(linha: number, nova: string) {
    if (nova.length < 6) throw new Falha('A nova senha precisa ter pelo menos 6 caracteres.');
    const sal = aleatorioHex_(16);
    const aba = this.aba('Usuarios', COLUNAS_USUARIOS);
    aba.getRange(`C${linha}`).setValue(sha256_(sal + nova));
    aba.getRange(`D${linha}`).setValue(sal);
  }

  private senhaConfereUsuario(u: { senhaHash: string; sal: string }, senha: string): boolean {
    return !!u.senhaHash && sha256_(u.sal + senha) === u.senhaHash;
  }

  /* ----------------------------------------------------------------------
     SHAREPOINT (os caminhos são a partir do site: /<biblioteca>/<pasta>)
     ---------------------------------------------------------------------- */
  novaPasta(nome: string): string {
    let pai = CONFIG.PASTA_RAIZ.replace(/\/+$/, '');
    const hoje = new Date();
    if (CONFIG.PASTA_POR_SEMANA) pai += '/' + nomeSemana_(hoje);
    return `${pai}/${nomeSeguro_(`${nome} - ${dataBr_(hoje)}`)}`;
  }

  lixeira(tipo: string, caminho: string) {
    this.operacoes.push({
      tipo: 'sharepoint',
      metodo: 'POST',
      uri: `_api/web/Get${tipo}ByServerRelativeUrl('${odata_(caminhoServidor_(caminho))}')/recycle()`,
    });
  }

  /* ----------------------------------------------------------------------
     PLANILHA
     ---------------------------------------------------------------------- */
  // Cria as abas que faltarem e a senha inicial. Roda sozinho a cada chamada.
  instalar() {
    this.abaCandidatos();
    this.aba('Sessoes', ['token', 'expira', 'email', 'papel']);
    this.aba('Usuarios', COLUNAS_USUARIOS);
    this.abaAjustes();
    this.aba('Sistema', ['chave', 'valor']);
    // A senha não fica mais global: cada pessoa é um usuário na aba "Usuarios".
    // O primeiro administrador é criado no 1º login (veja login()).
  }

  abaCandidatos(): ExcelScript.Worksheet {
    return this.aba('Candidatos', COLUNAS, true);
  }

  abaAjustes(): ExcelScript.Worksheet {
    return this.aba('Ajustes', []);
  }

  aba(nome: string, cabecalho: string[], visivel?: boolean): ExcelScript.Worksheet {
    let aba = this.wb.getWorksheet(nome);
    if (aba) return aba;
    aba = this.wb.addWorksheet(nome);
    // Tudo como texto: impede o Excel de converter código, telefone e datas por conta própria
    aba.getRange('A:Z').setNumberFormatLocal('@');
    if (cabecalho.length) {
      const topo = aba.getRange(`A1:${letra_(cabecalho.length - 1)}1`);
      topo.setValues([cabecalho]);
      topo.getFormat().getFont().setBold(true);
      aba.getFreezePanes().freezeRows(1);
    }
    if (!visivel) aba.setVisibility(ExcelScript.SheetVisibility.hidden);
    return aba;
  }

  // Linhas com dados, a partir da linha "inicio" (a 1ª é o cabeçalho)
  linhas(aba: ExcelScript.Worksheet, inicio: number = 2): (string | number | boolean)[][] {
    const usado = aba.getUsedRange(true);
    if (!usado) return [];
    const ultima = usado.getRowIndex() + usado.getRowCount();
    const colunas = usado.getColumnIndex() + usado.getColumnCount();
    if (ultima < inicio) return [];
    return aba.getRange(`A${inicio}:${letra_(colunas - 1)}${ultima}`).getValues();
  }

  reescrever(aba: ExcelScript.Worksheet, inicio: number, valores: string[][]) {
    const usado = aba.getUsedRange(true);
    if (usado) {
      const ultima = usado.getRowIndex() + usado.getRowCount();
      if (ultima >= inicio) aba.getRange(`${inicio}:${ultima}`).clear(ExcelScript.ClearApplyTo.contents);
    }
    if (valores.length) {
      aba.getRange(`A${inicio}:${letra_(valores[0].length - 1)}${inicio + valores.length - 1}`).setValues(valores);
    }
  }

  mapaSistema(): { [chave: string]: string } {
    if (this.sistema) return this.sistema;
    const mapa: { [chave: string]: string } = {};
    this.linhas(this.aba('Sistema', ['chave', 'valor'])).forEach((l) => {
      if (l[0]) mapa[String(l[0])] = String(l[1] === undefined ? '' : l[1]);
    });
    this.sistema = mapa;
    return mapa;
  }

  lerSistema(chave: string): string {
    return this.mapaSistema()[chave] || '';
  }

  gravarSistema(chave: string, valor: string) {
    const mapa = this.mapaSistema();
    mapa[chave] = valor;
    const aba = this.aba('Sistema', ['chave', 'valor']);
    this.reescrever(aba, 2, Object.keys(mapa).map((k) => [k, mapa[k]]));
  }

  lerTodos(): Candidato[] {
    return this.linhas(this.abaCandidatos())
      .map((linha, i) => paraObjeto_(linha, i + 2))
      .filter((c) => c.codigo);
  }

  salvar(c: Candidato) {
    this.abaCandidatos().getRange(`A${c._linha}:${letra_(COLUNAS.length - 1)}${c._linha}`).setValues([paraLinha_(c)]);
  }

  acharPorCodigo(codigo?: string): Candidato {
    const cod = String(codigo || '').replace(/\D/g, '');
    if (cod.length !== 6) throw new Falha('O código tem 6 números. Confira e tente de novo.', 'CODIGO');
    const c = this.lerTodos().find((x) => x.codigo === cod);
    if (!c) throw new Falha('Não encontramos esse código. Confira os números ou fale com o RH.', 'CODIGO');
    return c;
  }

}

/* ------------------------------------------------------------------------
   AUXILIARES
   Ficam fora da classe de propósito: o Office Script não aceita chamar
   métodos da classe (this.algo) dentro de funções como .map((x) => ...).
   ------------------------------------------------------------------------ */
// O candidato nunca recebe links do SharePoint nem dados internos
function publico_(c: Candidato): CandidatoPublico {
  const docs: { [id: string]: DocEnviado } = {};
  Object.keys(c.docs || {}).forEach((id) => {
    const d = c.docs[id];
    docs[id] = { enviadoEm: d.enviadoEm || '', pulado: !!d.pulado, reenviar: !!d.reenviar, arquivoNome: d.arquivoNome || '' };
  });
  return { codigo: c.codigo, nome: c.nome, cargo: c.cargo, empresa: c.empresa, documentos: c.documentos, docs, concluidoEm: c.concluidoEm };
}

function limpar_(c: Candidato): Candidato {
  const copia = Object.assign({}, c);
  delete copia._linha;
  return copia;
}

function paraObjeto_(linha: (string | number | boolean)[], numeroLinha: number): Candidato {
  const o: { [chave: string]: string | number | Documento[] | { [id: string]: DocEnviado } } = { _linha: numeroLinha };
  COLUNAS.forEach((chave, i) => {
    const bruto = linha[i] === undefined || linha[i] === null ? '' : String(linha[i]);
    if (COLUNAS_JSON.indexOf(chave) !== -1) {
      let v: Documento[] | { [id: string]: DocEnviado } | null = null;
      try { v = bruto ? JSON.parse(bruto) : null; } catch (e) { v = null; }
      o[chave] = v || (chave === 'docs' ? {} : []);
    } else {
      o[chave] = bruto;
    }
  });
  return o as unknown as Candidato;
}

function paraLinha_(c: Candidato): string[] {
  const o = c as unknown as { [chave: string]: string | object };
  return COLUNAS.map((k) => (COLUNAS_JSON.indexOf(k) !== -1 ? JSON.stringify(o[k]) : String(o[k] || '')));
}

function limparAjustes_(a: Ajustes): Ajustes {
  const txt = (v: string | undefined, max: number) => String(v === undefined || v === null ? '' : v).slice(0, max);
  const m = a.mensagens || {};
  const ajustes: Ajustes = {
    nomeRh: txt(a.nomeRh, 60).trim(),
    whatsappRh: txt(a.whatsappRh, 20).replace(/\D/g, ''),
    emailRecuperacao: txt(a.emailRecuperacao, 120).trim(),
    empresas: (a.empresas || [])
      .map((e) => ({ nome: txt(e.nome, 80).trim(), ativa: e.ativa !== false }))
      .filter((e) => e.nome),
    cargos: (a.cargos || [])
      .map((c) => ({ id: txt(c.id, 40), nome: txt(c.nome, 60).trim(), icone: txt(c.icone, 30), ativo: c.ativo !== false, documentos: limparDocumentos_(c.documentos || []) }))
      .filter((c) => c.id && c.nome),
    mensagens: { convite: txt(m.convite, 3000), cobranca: txt(m.cobranca, 3000), novaFoto: txt(m.novaFoto, 3000) },
  };
  if (JSON.stringify(ajustes).length > 45000) throw new Falha('As configurações ficaram grandes demais. Encurte as mensagens ou as dicas.');
  return ajustes;
}

function limparDocumentos_(lista: Documento[]): Documento[] {
  return (lista || [])
    .map((x) => ({
      id: String(x.id || '').slice(0, 40),
      nome: String(x.nome || '').trim().slice(0, 80),
      dica: String(x.dica || '').slice(0, 400),
      icone: String(x.icone || 'file').slice(0, 30),
      obrigatorio: !!x.obrigatorio,
    }))
    .filter((x) => x.id && x.nome);
}

// E-mail em minúsculas e sem espaços (usado como identificador de login)
function normalizarEmail_(email?: string): string {
  return String(email || '').trim().toLowerCase();
}

function validarEmail_(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Caracteres que o SharePoint não aceita (ou que quebram links) em nomes de arquivo e pasta
function nomeSeguro_(nome: string): string {
  return nome.replace(/[\\\/:*?"<>|#%]/g, '-').replace(/^[\s.]+|[\s.]+$/g, '');
}

function caminhoSite_(): string {
  return CONFIG.SITE_URL.replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '');
}

function caminhoServidor_(caminho: string): string {
  return caminhoSite_() + caminho;
}

function urlDe_(caminho: string): string {
  const origem = (CONFIG.SITE_URL.match(/^https?:\/\/[^/]+/) || [''])[0];
  return origem + encodeURI(caminhoServidor_(caminho));
}

// Miniatura que o painel mostra (aparece quando o navegador está logado no Microsoft 365)
function miniaturaDe_(caminho: string): string {
  return `${CONFIG.SITE_URL.replace(/\/+$/, '')}/_layouts/15/getpreview.ashx?path=${encodeURIComponent(urlDe_(caminho))}`;
}

// Texto seguro dentro de ('...') numa URL da API REST do SharePoint
function odata_(texto: string): string {
  return encodeURIComponent(texto.replace(/'/g, "''"));
}

function letra_(indice: number): string {
  return String.fromCharCode(65 + indice);
}

const agora_ = () => new Date().toISOString();

function dataLocal_(data: Date): Date {
  return new Date(data.getTime() + CONFIG.FUSO_HORAS * 3600e3);
}

function dataBr_(data: Date, comAno: boolean = true): string {
  const d = dataLocal_(data);
  const p = (n: number) => (n < 10 ? '0' : '') + n;
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}` + (comAno ? `-${d.getUTCFullYear()}` : '');
}

function nomeSemana_(data: Date): string {
  const local = dataLocal_(data);
  const recuo = (local.getUTCDay() + 6) % 7;
  const seg = new Date(data.getTime() - recuo * 86400e3);
  const dom = new Date(seg.getTime() + 6 * 86400e3);
  return `Semana ${dataBr_(seg, false)} a ${dataBr_(dom)}`;
}

function aleatorioHex_(tamanho: number): string {
  let s = '';
  while (s.length < tamanho) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

function sha256_(texto: string): string {
  // Bytes UTF-8
  const bytes: number[] = [];
  const cod = encodeURIComponent(texto);
  for (let i = 0; i < cod.length; i++) {
    if (cod[i] === '%') { bytes.push(parseInt(cod.substr(i + 1, 2), 16)); i += 2; } else bytes.push(cod.charCodeAt(i));
  }
  const bits = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bits >>> (i * 8)) & 0xff);

  // Constantes: partes fracionárias das raízes dos primeiros números primos
  const primos: number[] = [];
  for (let n = 2; primos.length < 64; n++) if (primos.every((p) => n % p !== 0)) primos.push(n);
  const frac = (x: number) => ((x - Math.floor(x)) * 0x100000000) | 0;
  const K = primos.map((p) => frac(Math.cbrt(p)));
  const H = primos.slice(0, 8).map((p) => frac(Math.sqrt(p)));

  const rot = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  const w: number[] = new Array(64);
  for (let bloco = 0; bloco < bytes.length; bloco += 64) {
    for (let i = 0; i < 16; i++) {
      const j = bloco + i * 4;
      w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rot(w[i - 15], 7) ^ rot(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rot(w[i - 2], 17) ^ rot(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    const vs = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i++) H[i] = (H[i] + vs[i]) | 0;
  }
  return H.map((v) => ('00000000' + (v >>> 0).toString(16)).slice(-8)).join('');
}
