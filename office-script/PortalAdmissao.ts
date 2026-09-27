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
  SITE_URL: "https://constate-my.sharepoint.com/personal/marianasilva_odilonsantos_com",
  // Pasta raiz dos documentos, a partir do site: /<biblioteca>/<pasta>
  PASTA_RAIZ: "/Documents/Sistema-RH",
  // 1º acesso: preencha os dois SÓ na cópia do script dentro do Excel, nunca aqui no GitHub.
  // Depois que o primeiro administrador entrar, eles deixam de ser usados (pode apagar).
  ADMIN_INICIAL_EMAIL: "",
  ADMIN_INICIAL_SENHA: "",
  FUSO_HORAS: -3,             // America/Sao_Paulo (sem horário de verão)
  SESSAO_HORAS: 6,
  PASTA_POR_SEMANA: false,    // true → Integração / Semana 08-09 a 14-09-2026 / Nome - Data
  TAMANHO_MAX_MB: 15,
};

const COLUNAS = ["codigo", "nome", "telefone", "cargo", "empresa", "documentos", "docs",
  "pasta", "pastaUrl", "criadoEm", "atualizadoEm", "concluidoEm"];
// Aba oculta "Usuarios": quem pode entrar no painel e com qual papel
const COLUNAS_USUARIOS = ["email", "nome", "senhaHash", "sal", "papel", "ativo", "criadoEm"];
const COLUNAS_JSON = ["documentos", "docs"];
const TIPOS_ACEITOS = ["image/jpeg", "image/png", "application/pdf"];
const EXTENSOES: { [tipo: string]: string } = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };

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

interface FalhaNegocio {
  mensagem: string;
  codigo: string;
}

function falha_(mensagem: string, codigo: string = "NEGOCIO"): FalhaNegocio {
  return { mensagem, codigo };
}

function ehFalha_(e: unknown): e is FalhaNegocio {
  return typeof e === "object" && e !== null && "mensagem" in e && "codigo" in e;
}

// Estado da execução atual (substitui a antiga classe Portal para 100% de compatibilidade com Office Scripts)
interface Contexto {
  wb: ExcelScript.Workbook;
  operacoes: Operacao[];
  depois?: { acao: string; dados: Dados };
  sistema?: { [chave: string]: string };
}

/* ------------------------------------------------------------------------
   ENTRADA – chamada pelo Power Automate ("Executar script")
   ------------------------------------------------------------------------ */
function main(workbook: ExcelScript.Workbook, acao: string = "", dados: string = "{}", interno: boolean = false): string {
  const ctx: Contexto = {
    wb: workbook,
    operacoes: [],
  };
  let resultado: Resultado;
  try {
    const d = JSON.parse(dados || "{}") as Dados;
    resultado = {
      resposta: { ok: true, dados: executar(ctx, acao, d, !!interno) },
      operacoes: ctx.operacoes,
      depois: ctx.depois,
    };
  } catch (e) {
    let erro = String(e);
    let codigo = "";
    if (ehFalha_(e)) {
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

/* ------------------------------------------------------------------------
   ROTAS
   ------------------------------------------------------------------------ */
function executar(ctx: Contexto, acao: string, d: Dados, interno: boolean): RespostaDados {
  instalar(ctx);
  switch (acao) {
    case "candidato.entrar": return { candidato: publico_(acharPorCodigo(ctx, d.codigo)) };
    case "candidato.enviar": return enviarDocumento(ctx, d);
    case "candidato.pular": return pularDocumento(ctx, d);
    case "candidato.concluir": return concluir(ctx, d);

    case "publico.ajustes": return ajustesPublicos(ctx);

    case "admin.login": return login(ctx, d);
    case "admin.esqueciSenha": return esqueciSenha(ctx, d);
    case "admin.redefinirSenha": return redefinirSenha(ctx, d);
    // Leitura: qualquer usuário logado (admin ou somente leitura)
    case "admin.listar": {
      const s = exigirSessao(ctx, d.token);
      return { candidatos: lerTodos(ctx).map((c) => limpar_(c)), ajustes: lerAjustes(ctx), papel: s.papel };
    }
    // Escrita: só administradores
    case "admin.criar": exigirAdmin(ctx, d.token); return criarCandidato(ctx, d);
    case "admin.editar": exigirAdmin(ctx, d.token); return editarCandidato(ctx, d);
    case "admin.pedirReenvio": exigirAdmin(ctx, d.token); return pedirReenvio(ctx, d);
    case "admin.excluir": exigirAdmin(ctx, d.token); return excluir(ctx, d);
    case "admin.salvarAjustes": exigirAdmin(ctx, d.token); return salvarAjustes(ctx, d);
    // Trocar a própria senha: qualquer usuário logado
    case "admin.trocarSenha": {
      const s = exigirSessao(ctx, d.token);
      return trocarSenha(ctx, d, s);
    }
    // Gestão de usuários: só administradores
    case "admin.usuarios.listar": exigirAdmin(ctx, d.token); return { usuarios: lerUsuarios(ctx) };
    case "admin.usuarios.criar": exigirAdmin(ctx, d.token); return criarUsuario(ctx, d);
    case "admin.usuarios.editar": exigirAdmin(ctx, d.token); return editarUsuario(ctx, d);
    case "admin.usuarios.senha": exigirAdmin(ctx, d.token); return redefinirSenhaUsuario(ctx, d);
    case "admin.usuarios.remover": exigirAdmin(ctx, d.token); return removerUsuario(ctx, d);

    case "interno.registrarEnvio":
      if (!interno) throw falha_("Ação inválida.");
      return registrarEnvio(ctx, d);

    case "ping": return { mensagem: "API do Portal de Admissão funcionando." };
  }
  throw falha_("Ação inválida.");
}

/* ------------------------------------------------------------------------
   CANDIDATO
   ------------------------------------------------------------------------ */
// 1ª etapa: valida e pede ao fluxo para salvar o arquivo.
// Só depois que o arquivo está no SharePoint o fluxo chama interno.registrarEnvio.
function enviarDocumento(ctx: Contexto, d: Dados): RespostaDados {
  const c = acharPorCodigo(ctx, d.codigo);
  if (c.concluidoEm) throw falha_("Seus documentos já foram finalizados. Se precisar mudar algo, fale com o RH.");

  const doc = (c.documentos || []).find((x) => x.id === d.docId);
  if (!doc) throw falha_("Documento inválido.");

  const arq = d.arquivo || {};
  const tipo = String(arq.tipo || "");
  if (TIPOS_ACEITOS.indexOf(tipo) === -1) throw falha_("Tipo de arquivo não aceito. Envie uma foto ou um PDF.");
  const tamanho = Number(arq.tamanho || 0);
  if (!tamanho) throw falha_("O arquivo chegou vazio. Tente de novo.");
  if (tamanho > CONFIG.TAMANHO_MAX_MB * 1024 * 1024) throw falha_(`Arquivo muito grande (máximo ${CONFIG.TAMANHO_MAX_MB} MB).`);

  const pasta = c.pasta || novaPasta(c.nome);

  // Se já existia um arquivo para este documento, manda o antigo para a lixeira
  const anterior = c.docs[doc.id];
  if (anterior && anterior.caminho) lixeira(ctx, "File", anterior.caminho);

  const nomeArquivo = nomeSeguro_(`${doc.nome} - ${c.nome}.${EXTENSOES[tipo]}`);
  const caminho = `${pasta}/${nomeArquivo}`;
  ctx.operacoes.push({ tipo: "arquivo", pasta, nome: nomeArquivo });

  ctx.depois = {
    acao: "interno.registrarEnvio",
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
function registrarEnvio(ctx: Contexto, d: Dados): RespostaDados {
  const c = acharPorCodigo(ctx, d.codigo);
  const r = d.registro || {};
  c.pasta = String(d.pasta || c.pasta);
  c.pastaUrl = String(d.pastaUrl || c.pastaUrl);
  c.docs[String(d.docId)] = {
    arquivoNome: r.arquivoNome, tipo: r.tipo, caminho: r.caminho, url: r.url, miniatura: r.miniatura,
    enviadoEm: agora_(),
  };
  c.atualizadoEm = agora_();
  salvar(ctx, c);
  return { candidato: publico_(c) };
}

function pularDocumento(ctx: Contexto, d: Dados): RespostaDados {
  const c = acharPorCodigo(ctx, d.codigo);
  const doc = (c.documentos || []).find((x) => x.id === d.docId);
  if (!doc || doc.obrigatorio) throw falha_("Este documento é obrigatório.");
  c.docs[doc.id] = { pulado: true, enviadoEm: "", puladoEm: agora_() };
  c.atualizadoEm = agora_();
  salvar(ctx, c);
  return { candidato: publico_(c) };
}

function concluir(ctx: Contexto, d: Dados): RespostaDados {
  const c = acharPorCodigo(ctx, d.codigo);
  const faltando = obrigatoriosFaltando(c);
  if (faltando.length) throw falha_("Ainda faltam documentos obrigatórios: " + faltando.map((f) => f.nome).join(", "));
  c.concluidoEm = c.concluidoEm || agora_();
  c.atualizadoEm = agora_();
  salvar(ctx, c);
  return { candidato: publico_(c) };
}

function obrigatoriosFaltando(c: Candidato): Documento[] {
  return (c.documentos || []).filter((doc) => {
    const x = c.docs[doc.id];
    return doc.obrigatorio && !(x && x.enviadoEm && !x.reenviar);
  });
}

/* ------------------------------------------------------------------------
   ADMIN
   ------------------------------------------------------------------------ */
function login(ctx: Contexto, d: Dados): RespostaDados {
  const agora = Date.now();
  const email = normalizarEmail_(d.email);
  const senha = String(d.senha || "");
  const bloqueioAte = Date.parse(lerSistema(ctx, "loginBloqueioAte") || "") || 0;
  const tentativas = bloqueioAte > agora ? Number(lerSistema(ctx, "loginFalhas") || 0) : 0;
  if (tentativas >= 10) throw falha_("Muitas tentativas. Aguarde 10 minutos e tente de novo.");
  if (!email) throw falha_("Informe o seu e-mail.");

  const linhasTab = linhasUsuarios(ctx);
  let usuario = linhasTab.find((u) => u.email === email);

  // 1º acesso: sem nenhum usuário ainda. Só entra quem digitar exatamente o
  // ADMIN_INICIAL_EMAIL e a ADMIN_INICIAL_SENHA preenchidos no script do Excel.
  if (linhasTab.length === 0) {
    const emailInicial = normalizarEmail_(CONFIG.ADMIN_INICIAL_EMAIL);
    if (!emailInicial || CONFIG.ADMIN_INICIAL_SENHA.length < 8) {
      throw falha_("Primeiro acesso não configurado. Preencha ADMIN_INICIAL_EMAIL e ADMIN_INICIAL_SENHA (mínimo 8 caracteres) no script do Excel.");
    }
    if (email !== emailInicial || senha !== CONFIG.ADMIN_INICIAL_SENHA) {
      registrarFalhaLogin(ctx, agora, tentativas);
      throw falha_("E-mail ou senha incorretos.");
    }
    gravarUsuario(ctx, { email, nome: "Administrador", papel: "admin", ativo: true }, senha);
    usuario = linhasUsuarios(ctx).find((u) => u.email === email);
  }

  if (!usuario || usuario.ativo === false || !senhaConfereUsuario(usuario, senha)) {
    registrarFalhaLogin(ctx, agora, tentativas);
    throw falha_("E-mail ou senha incorretos.");
  }

  gravarSistema(ctx, "loginFalhas", "0");
  const token = aleatorioHex_(32);
  const abaSessoes = aba(ctx, "Sessoes", ["token", "expira", "email", "papel"]);
  const validas = linhas(ctx, abaSessoes)
    .filter((l) => l[0] && Date.parse(String(l[1])) > agora)
    .map((l) => [String(l[0]), String(l[1]), String(l[2] || ""), String(l[3] || "")]);
  validas.push([token, new Date(agora + CONFIG.SESSAO_HORAS * 3600e3).toISOString(), usuario.email, usuario.papel]);
  reescrever(ctx, abaSessoes, 2, validas);
  return { token, papel: usuario.papel, nome: usuario.nome, email: usuario.email };
}

function registrarFalhaLogin(ctx: Contexto, agora: number, tentativas: number) {
  gravarSistema(ctx, "loginFalhas", String(tentativas + 1));
  gravarSistema(ctx, "loginBloqueioAte", new Date(agora + 10 * 60e3).toISOString());
}

function exigirSessao(ctx: Contexto, token?: string): Sessao {
  const linha = !token ? undefined : linhas(ctx, aba(ctx, "Sessoes", ["token", "expira", "email", "papel"]))
    .find((l) => String(l[0]) === token && Date.parse(String(l[1])) > Date.now());
  if (!linha) throw falha_("Sua sessão expirou. Entre novamente.", "SESSAO");
  return { email: String(linha[2] || ""), papel: String(linha[3] || "admin") };
}

function exigirAdmin(ctx: Contexto, token?: string): Sessao {
  const s = exigirSessao(ctx, token);
  if (s.papel !== "admin") throw falha_("Esta ação é só para administradores.", "PERMISSAO");
  return s;
}

function criarCandidato(ctx: Contexto, d: Dados): RespostaDados {
  const nome = String(d.nome || "").trim();
  if (!nome) throw falha_("Informe o nome do candidato.");
  if (!Array.isArray(d.documentos) || !d.documentos.length) throw falha_("Lista de documentos vazia.");

  const todos = lerTodos(ctx);
  let codigo: string;
  do codigo = String(100000 + Math.floor(Math.random() * 900000));
  while (todos.some((c) => c.codigo === codigo));

  const c: Candidato = {
    codigo,
    nome,
    telefone: String(d.telefone || "").replace(/\D/g, ""),
    cargo: String(d.cargo || ""),
    empresa: String(d.empresa || ""),
    documentos: limparDocumentos_(d.documentos),
    docs: {},
    pasta: "",
    pastaUrl: "",
    criadoEm: agora_(),
    atualizadoEm: agora_(),
    concluidoEm: "",
  };
  const abaCand = abaCandidatos(ctx);
  const usado = abaCand.getUsedRange(true);
  c._linha = usado ? usado.getRowIndex() + usado.getRowCount() + 1 : 2;
  salvar(ctx, c);
  return { candidato: limpar_(c) };
}

function editarCandidato(ctx: Contexto, d: Dados): RespostaDados {
  const c = acharPorCodigo(ctx, d.codigo);
  const nome = String(d.nome || "").trim();
  if (!nome) throw falha_("Informe o nome do candidato.");

  const nomeAntigo = c.nome;
  c.nome = nome;
  c.telefone = String(d.telefone || "").replace(/\D/g, "");
  c.empresa = String(d.empresa || "");
  c.cargo = String(d.cargo || c.cargo);
  // Documentos já enviados continuam guardados em c.docs, mesmo que saiam da lista
  if (Array.isArray(d.documentos) && d.documentos.length) c.documentos = limparDocumentos_(d.documentos);

  if (obrigatoriosFaltando(c).length) c.concluidoEm = "";

  if (nomeAntigo !== nome && c.pasta) {
    const corte = c.pasta.lastIndexOf("/");
    const novaPastaPath = c.pasta.slice(0, corte + 1) + nomeSeguro_(c.pasta.slice(corte + 1).replace(nomeAntigo, nome));
    if (novaPastaPath !== c.pasta) {
      ctx.operacoes.push({
        tipo: "sharepoint",
        metodo: "POST",
        uri: `_api/web/GetFolderByServerRelativeUrl('${odata_(caminhoServidor_(c.pasta))}')/moveto(newurl='${odata_(caminhoServidor_(novaPastaPath))}')`,
      });
      // Atualiza os links dos arquivos que estão dentro da pasta
      Object.keys(c.docs).forEach((id) => {
        const x = c.docs[id];
        if (x.caminho && x.caminho.indexOf(c.pasta + "/") === 0) {
          x.caminho = novaPastaPath + x.caminho.slice(c.pasta.length);
          x.url = urlDe_(x.caminho);
          x.miniatura = miniaturaDe_(x.caminho);
        }
      });
      c.pasta = novaPastaPath;
      c.pastaUrl = urlDe_(novaPastaPath);
    }
  }

  c.atualizadoEm = agora_();
  salvar(ctx, c);
  return { candidato: limpar_(c) };
}

function pedirReenvio(ctx: Contexto, d: Dados): RespostaDados {
  const c = acharPorCodigo(ctx, d.codigo);
  const docId = String(d.docId || "");
  const anterior = c.docs[docId];
  if (anterior && anterior.caminho) lixeira(ctx, "File", anterior.caminho);
  c.docs[docId] = { reenviar: true, pedidoEm: agora_() };
  c.concluidoEm = "";
  c.atualizadoEm = agora_();
  salvar(ctx, c);
  return { candidato: limpar_(c) };
}

function excluir(ctx: Contexto, d: Dados): RespostaDados {
  const c = acharPorCodigo(ctx, d.codigo);
  if (c.pasta) lixeira(ctx, "Folder", c.pasta);
  abaCandidatos(ctx).getRange(`${c._linha}:${c._linha}`).delete(ExcelScript.DeleteShiftDirection.up);
  return { ok: true };
}

/* ------------------------------------------------------------------------
   CONFIGURAÇÕES (editadas pelo painel) E SENHA
   ------------------------------------------------------------------------ */
// Aba "Ajustes": o JSON fica em pedaços na coluna A (cada célula aceita no máximo 32.767 caracteres)
function lerAjustes(ctx: Contexto): Ajustes | undefined {
  try {
    const texto = linhas(ctx, abaAjustes(ctx), 1).map((l) => String(l[0] || "")).join("");
    return texto ? (JSON.parse(texto) as Ajustes) : undefined;
  } catch (e) {
    return undefined;
  }
}

function gravarAjustes(ctx: Contexto, ajustes: Ajustes) {
  const abaAj = abaAjustes(ctx);
  const texto = JSON.stringify(ajustes);
  const pedacos: string[][] = [];
  for (let i = 0; i < texto.length; i += 30000) pedacos.push([texto.slice(i, i + 30000)]);
  abaAj.getRange("A:A").clear(ExcelScript.ClearApplyTo.contents);
  abaAj.getRange(`A1:A${pedacos.length}`).setValues(pedacos);
}

function ajustesPublicos(ctx: Contexto): RespostaDados {
  const a = lerAjustes(ctx) || {};
  return {
    ajustes: {
      nomeRh: a.nomeRh || "",
      whatsappRh: a.whatsappRh || "",
      cargos: (a.cargos || []).map((c) => ({ id: c.id, nome: c.nome })),
    },
  };
}

function salvarAjustes(ctx: Contexto, d: Dados): RespostaDados {
  const ajustes = limparAjustes_(d.ajustes || {});

  // Renomear empresa → atualiza todos os candidatos de uma vez
  const mapa: { [de: string]: string } = {};
  (d.renomear || []).forEach((r) => {
    const de = String(r.de || "");
    const para = String(r.para || "").trim();
    if (de && para && de !== para) mapa[de] = para;
  });
  if (Object.keys(mapa).length) {
    const abaCand = abaCandidatos(ctx);
    const usado = abaCand.getUsedRange(true);
    const linhasQtd = usado ? usado.getRowIndex() + usado.getRowCount() - 1 : 0;
    if (linhasQtd > 0) {
      const coluna = letra_(COLUNAS.indexOf("empresa"));
      const faixa = abaCand.getRange(`${coluna}2:${coluna}${linhasQtd + 1}`);
      faixa.setValues(faixa.getValues().map((l) => {
        const v = String(l[0]);
        return [mapa[v] !== undefined ? mapa[v] : v];
      }));
    }
  }

  gravarAjustes(ctx, ajustes);
  return { ajustes, candidatos: lerTodos(ctx).map((c) => limpar_(c)) };
}

// Cada pessoa troca a própria senha (sabemos quem é pela sessão)
function trocarSenha(ctx: Contexto, d: Dados, sessao: Sessao): RespostaDados {
  const u = acharUsuarioLinha(ctx, sessao.email);
  if (!u) throw falha_("Usuário não encontrado.");
  if (!senhaConfereUsuario(u.usuario, String(d.senhaAtual || ""))) throw falha_("A senha atual está incorreta.");
  definirSenhaUsuario(ctx, u.linha, String(d.novaSenha || ""));
  return { ok: true };
}

// "Esqueci a senha": o código vai para o e-mail da própria conta
function esqueciSenha(ctx: Contexto, d: Dados): RespostaDados {
  const email = normalizarEmail_(d.email);
  if (!email) throw falha_("Informe o seu e-mail.");
  const enviadaEm = Date.parse(lerSistema(ctx, "recuperacaoEnviadaEm") || "") || 0;
  if (Date.now() - enviadaEm < 60e3) throw falha_("Já enviamos um código há pouco. Confira o e-mail (e a caixa de spam).");

  const alvo = linhasUsuarios(ctx).find((u) => u.email === email && u.ativo !== false);
  if (!alvo) throw falha_("Não encontramos uma conta ativa com esse e-mail.");

  const codigo = String(100000 + Math.floor(Math.random() * 900000));
  gravarSistema(ctx, "recuperacaoEmail", email);
  gravarSistema(ctx, "recuperacaoCodigo", codigo);
  gravarSistema(ctx, "recuperacaoValidade", new Date(Date.now() + 15 * 60e3).toISOString());
  gravarSistema(ctx, "recuperacaoFalhas", "0");
  gravarSistema(ctx, "recuperacaoEnviadaEm", agora_());
  ctx.operacoes.push({
    tipo: "email",
    para: email,
    assunto: "Código para redefinir a senha – Portal de Admissão",
    corpo: `Seu código para criar uma nova senha é: <b>${codigo}</b><br><br>Ele vale por 15 minutos. Se não foi você que pediu, ignore este e-mail.`,
  });

  const partes = email.split("@");
  return { email: `${partes[0].slice(0, 2)}***@${partes[1] || ""}` };
}

function redefinirSenha(ctx: Contexto, d: Dados): RespostaDados {
  const tentativas = Number(lerSistema(ctx, "recuperacaoFalhas") || 0);
  if (tentativas >= 5) throw falha_("Muitas tentativas. Peça um novo código.");
  const codigo = lerSistema(ctx, "recuperacaoCodigo");
  const valido = Date.parse(lerSistema(ctx, "recuperacaoValidade") || "") > Date.now();
  if (!codigo || !valido || String(d.codigo || "").replace(/\D/g, "") !== codigo) {
    gravarSistema(ctx, "recuperacaoFalhas", String(tentativas + 1));
    throw falha_("Código inválido ou vencido.");
  }
  const u = acharUsuarioLinha(ctx, lerSistema(ctx, "recuperacaoEmail"));
  if (!u) throw falha_("Conta não encontrada. Peça um novo código.");
  definirSenhaUsuario(ctx, u.linha, String(d.novaSenha || ""));
  gravarSistema(ctx, "recuperacaoCodigo", "");
  gravarSistema(ctx, "recuperacaoEmail", "");
  gravarSistema(ctx, "recuperacaoFalhas", "0");
  return { ok: true };
}

/* ------------------------------------------------------------------------
   USUÁRIOS DO PAINEL (aba oculta "Usuarios")
   ------------------------------------------------------------------------ */
// Lista pública (sem hash nem sal) para o painel
function lerUsuarios(ctx: Contexto): Usuario[] {
  return linhasUsuarios(ctx).map((u) => ({ email: u.email, nome: u.nome, papel: u.papel, ativo: u.ativo }));
}

// Linhas cruas da aba, com email já normalizado
function linhasUsuarios(ctx: Contexto): UsuarioLinha[] {
  return linhas(ctx, aba(ctx, "Usuarios", COLUNAS_USUARIOS)).filter((l) => l[0]).map((l) => ({
    email: normalizarEmail_(String(l[0])),
    nome: String(l[1] || ""),
    senhaHash: String(l[2] || ""),
    sal: String(l[3] || ""),
    papel: String(l[4] || "leitura") === "admin" ? "admin" : "leitura",
    ativo: String(l[5] || "sim").toLowerCase() !== "nao",
    criadoEm: String(l[6] || ""),
  }));
}

function acharUsuarioLinha(ctx: Contexto, email?: string): { usuario: UsuarioLinha; linha: number } | undefined {
  const alvo = normalizarEmail_(email);
  if (!alvo) return undefined;
  const todas = linhasUsuarios(ctx);
  const idx = todas.findIndex((u) => u.email === alvo);
  return idx === -1 ? undefined : { usuario: todas[idx], linha: idx + 2 };
}

function reescreverUsuarios(ctx: Contexto, lista: UsuarioLinha[]) {
  const abaUsr = aba(ctx, "Usuarios", COLUNAS_USUARIOS);
  reescrever(ctx, abaUsr, 2, lista.map((u) => [u.email, u.nome, u.senhaHash, u.sal, u.papel,
    u.ativo === false ? "nao" : "sim", u.criadoEm || agora_()]));
}

function criarUsuario(ctx: Contexto, d: Dados): RespostaDados {
  const email = normalizarEmail_(d.email);
  const nome = String(d.nome || "").trim();
  const papel = String(d.papel || "leitura") === "admin" ? "admin" : "leitura";
  if (!validarEmail_(email)) throw falha_("E-mail inválido.");
  if (!nome) throw falha_("Informe o nome do usuário.");
  if (acharUsuarioLinha(ctx, email)) throw falha_("Já existe um usuário com esse e-mail.");
  gravarUsuario(ctx, { email, nome, papel, ativo: true }, String(d.novaSenha || ""));
  return { usuarios: lerUsuarios(ctx) };
}

function editarUsuario(ctx: Contexto, d: Dados): RespostaDados {
  const alvo = acharUsuarioLinha(ctx, d.emailAlvo);
  if (!alvo) throw falha_("Usuário não encontrado.");
  const nome = String(d.nome || alvo.usuario.nome).trim();
  const papel = d.papel === undefined ? alvo.usuario.papel : (String(d.papel) === "admin" ? "admin" : "leitura");
  const ativo = d.ativo === undefined ? alvo.usuario.ativo : !!d.ativo;
  // Não deixar o sistema ficar sem nenhum administrador ativo
  if ((papel !== "admin" || !ativo) && alvo.usuario.papel === "admin" && alvo.usuario.ativo) {
    const outrosAdmins = linhasUsuarios(ctx).filter((u) => u.papel === "admin" && u.ativo && u.email !== alvo.usuario.email);
    if (!outrosAdmins.length) throw falha_("É preciso manter ao menos um administrador ativo.");
  }
  const abaUsr = aba(ctx, "Usuarios", COLUNAS_USUARIOS);
  abaUsr.getRange(`B${alvo.linha}`).setValues([[nome]]);
  abaUsr.getRange(`E${alvo.linha}`).setValues([[papel]]);
  abaUsr.getRange(`F${alvo.linha}`).setValues([[ativo ? "sim" : "nao"]]);
  return { usuarios: lerUsuarios(ctx) };
}

function redefinirSenhaUsuario(ctx: Contexto, d: Dados): RespostaDados {
  const alvo = acharUsuarioLinha(ctx, d.emailAlvo);
  if (!alvo) throw falha_("Usuário não encontrado.");
  definirSenhaUsuario(ctx, alvo.linha, String(d.novaSenha || ""));
  return { ok: true };
}

function removerUsuario(ctx: Contexto, d: Dados): RespostaDados {
  const alvo = acharUsuarioLinha(ctx, d.emailAlvo);
  if (!alvo) throw falha_("Usuário não encontrado.");
  if (alvo.usuario.papel === "admin" && alvo.usuario.ativo) {
    const outrosAdmins = linhasUsuarios(ctx).filter((u) => u.papel === "admin" && u.ativo && u.email !== alvo.usuario.email);
    if (!outrosAdmins.length) throw falha_("É preciso manter ao menos um administrador ativo.");
  }
  const restantes = linhasUsuarios(ctx).filter((u) => u.email !== alvo.usuario.email);
  reescreverUsuarios(ctx, restantes);
  return { usuarios: lerUsuarios(ctx) };
}

// Cria ou substitui a linha de um usuário, gravando o hash da senha
function gravarUsuario(ctx: Contexto, u: Usuario, senha: string) {
  if (senha.length < 6) throw falha_("A senha precisa ter pelo menos 6 caracteres.");
  const sal = aleatorioHex_(16);
  const hash = sha256_(sal + senha);
  const abaUsr = aba(ctx, "Usuarios", COLUNAS_USUARIOS);
  const existente = acharUsuarioLinha(ctx, u.email);
  const linha = existente ? existente.linha : (linhasUsuarios(ctx).length + 2);
  abaUsr.getRange(`A${linha}:${letra_(COLUNAS_USUARIOS.length - 1)}${linha}`)
    .setValues([[u.email, u.nome, hash, sal, u.papel, u.ativo === false ? "nao" : "sim", agora_()]]);
}

// Troca só a senha (hash + sal) de uma linha existente
function definirSenhaUsuario(ctx: Contexto, linha: number, nova: string) {
  if (nova.length < 6) throw falha_("A nova senha precisa ter pelo menos 6 caracteres.");
  const sal = aleatorioHex_(16);
  const abaUsr = aba(ctx, "Usuarios", COLUNAS_USUARIOS);
  abaUsr.getRange(`C${linha}`).setValues([[sha256_(sal + nova)]]);
  abaUsr.getRange(`D${linha}`).setValues([[sal]]);
}

function senhaConfereUsuario(u: { senhaHash: string; sal: string }, senha: string): boolean {
  return !!u.senhaHash && sha256_(u.sal + senha) === u.senhaHash;
}

/* ------------------------------------------------------------------------
   SHAREPOINT (os caminhos são a partir do site: /<biblioteca>/<pasta>)
   ------------------------------------------------------------------------ */
function novaPasta(nome: string): string {
  let pai = CONFIG.PASTA_RAIZ.replace(/\/+$/, "");
  const hoje = new Date();
  if (CONFIG.PASTA_POR_SEMANA) pai += "/" + nomeSemana_(hoje);
  return `${pai}/${nomeSeguro_(`${nome} - ${dataBr_(hoje)}`)}`;
}

function lixeira(ctx: Contexto, tipo: string, caminho: string) {
  ctx.operacoes.push({
    tipo: "sharepoint",
    metodo: "POST",
    uri: `_api/web/Get${tipo}ByServerRelativeUrl('${odata_(caminhoServidor_(caminho))}')/recycle()`,
  });
}

/* ------------------------------------------------------------------------
   PLANILHA
   ------------------------------------------------------------------------ */
// Cria as abas que faltarem e a senha inicial. Roda sozinho a cada chamada.
function instalar(ctx: Contexto) {
  abaCandidatos(ctx);
  aba(ctx, "Sessoes", ["token", "expira", "email", "papel"]);
  aba(ctx, "Usuarios", COLUNAS_USUARIOS);
  abaAjustes(ctx);
  aba(ctx, "Sistema", ["chave", "valor"]);
}

function abaCandidatos(ctx: Contexto): ExcelScript.Worksheet {
  return aba(ctx, "Candidatos", COLUNAS, true);
}

function abaAjustes(ctx: Contexto): ExcelScript.Worksheet {
  return aba(ctx, "Ajustes", []);
}

function aba(ctx: Contexto, nome: string, cabecalho: string[], visivel?: boolean): ExcelScript.Worksheet {
  let worksheet = ctx.wb.getWorksheet(nome);
  if (worksheet) return worksheet;
  worksheet = ctx.wb.addWorksheet(nome);
  // Tudo como texto: impede o Excel de converter código, telefone e datas por conta própria
  worksheet.getRange("A:Z").setNumberFormatLocal("@");
  if (cabecalho.length) {
    const topo = worksheet.getRange(`A1:${letra_(cabecalho.length - 1)}1`);
    topo.setValues([cabecalho]);
    topo.getFormat().getFont().setBold(true);
    worksheet.getFreezePanes().freezeRows(1);
  }
  if (!visivel) worksheet.setVisibility(ExcelScript.SheetVisibility.hidden);
  return worksheet;
}

// Linhas com dados, a partir da linha "inicio" (a 1ª é o cabeçalho)
function linhas(ctx: Contexto, worksheet: ExcelScript.Worksheet, inicio: number = 2): (string | number | boolean)[][] {
  const usado = worksheet.getUsedRange(true);
  if (!usado) return [];
  const ultima = usado.getRowIndex() + usado.getRowCount();
  const colunas = usado.getColumnIndex() + usado.getColumnCount();
  if (ultima < inicio) return [];
  return worksheet.getRange(`A${inicio}:${letra_(colunas - 1)}${ultima}`).getValues();
}

function reescrever(ctx: Contexto, worksheet: ExcelScript.Worksheet, inicio: number, valores: string[][]) {
  const usado = worksheet.getUsedRange(true);
  if (usado) {
    const ultima = usado.getRowIndex() + usado.getRowCount();
    if (ultima >= inicio) worksheet.getRange(`${inicio}:${ultima}`).clear(ExcelScript.ClearApplyTo.contents);
  }
  if (valores.length) {
    worksheet.getRange(`A${inicio}:${letra_(valores[0].length - 1)}${inicio + valores.length - 1}`).setValues(valores);
  }
}

function mapaSistema(ctx: Contexto): { [chave: string]: string } {
  if (ctx.sistema) return ctx.sistema;
  const mapa: { [chave: string]: string } = {};
  linhas(ctx, aba(ctx, "Sistema", ["chave", "valor"])).forEach((l) => {
    if (l[0]) mapa[String(l[0])] = String(l[1] === undefined ? "" : l[1]);
  });
  ctx.sistema = mapa;
  return mapa;
}

function lerSistema(ctx: Contexto, chave: string): string {
  return mapaSistema(ctx)[chave] || "";
}

function gravarSistema(ctx: Contexto, chave: string, valor: string) {
  const mapa = mapaSistema(ctx);
  mapa[chave] = valor;
  const abaSist = aba(ctx, "Sistema", ["chave", "valor"]);
  reescrever(ctx, abaSist, 2, Object.keys(mapa).map((k) => [k, mapa[k]]));
}

function lerTodos(ctx: Contexto): Candidato[] {
  return linhas(ctx, abaCandidatos(ctx))
    .map((linha, i) => paraObjeto_(linha, i + 2))
    .filter((c) => c.codigo);
}

function salvar(ctx: Contexto, c: Candidato) {
  abaCandidatos(ctx).getRange(`A${c._linha}:${letra_(COLUNAS.length - 1)}${c._linha}`).setValues([paraLinha_(c)]);
}

function acharPorCodigo(ctx: Contexto, codigo?: string): Candidato {
  const cod = String(codigo || "").replace(/\D/g, "");
  if (cod.length !== 6) throw falha_("O código tem 6 números. Confira e tente de novo.", "CODIGO");
  const c = lerTodos(ctx).find((x) => x.codigo === cod);
  if (!c) throw falha_("Não encontramos esse código. Confira os números ou fale com o RH.", "CODIGO");
  return c;
}

/* ------------------------------------------------------------------------
   AUXILIARES
   ------------------------------------------------------------------------ */
// O candidato nunca recebe links do SharePoint nem dados internos
function publico_(c: Candidato): CandidatoPublico {
  const docs: { [id: string]: DocEnviado } = {};
  Object.keys(c.docs || {}).forEach((id) => {
    const d = c.docs[id];
    docs[id] = { enviadoEm: d.enviadoEm || "", pulado: !!d.pulado, reenviar: !!d.reenviar, arquivoNome: d.arquivoNome || "" };
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
    const v = linha[i] === undefined ? "" : linha[i];
    if (COLUNAS_JSON.indexOf(chave) !== -1) {
      try { o[chave] = JSON.parse(String(v || (chave === "documentos" ? "[]" : "{}"))); }
      catch (e) { o[chave] = chave === "documentos" ? [] : {}; }
    } else {
      o[chave] = String(v);
    }
  });
  return o as unknown as Candidato;
}

function paraLinha_(c: Candidato): (string | number | boolean)[] {
  const obj = c as unknown as { [chave: string]: string | Documento[] | { [id: string]: DocEnviado } };
  return COLUNAS.map((chave) => (COLUNAS_JSON.indexOf(chave) !== -1 ? JSON.stringify(obj[chave] || (chave === "documentos" ? [] : {})) : String(obj[chave] || "")));
}

function limparAjustes_(a: Ajustes): Ajustes {
  return {
    nomeRh: String(a.nomeRh || "").trim(),
    whatsappRh: String(a.whatsappRh || "").replace(/\D/g, ""),
    emailRecuperacao: normalizarEmail_(a.emailRecuperacao),
    empresas: (a.empresas || [])
      .map((e) => ({ nome: String(e.nome || "").trim(), ativa: e.ativa !== false }))
      .filter((e) => e.nome),
    cargos: (a.cargos || [])
      .map((c) => ({
        id: String(c.id || "").trim(),
        nome: String(c.nome || "").trim(),
        icone: String(c.icone || "pasta"),
        ativo: c.ativo !== false,
        documentos: limparDocumentos_(c.documentos || []),
      }))
      .filter((c) => c.id && c.nome),
    mensagens: {
      convite: String((a.mensagens && a.mensagens.convite) || ""),
      cobranca: String((a.mensagens && a.mensagens.cobranca) || ""),
      novaFoto: String((a.mensagens && a.mensagens.novaFoto) || ""),
    },
  };
}

function limparDocumentos_(docs: Documento[]): Documento[] {
  return (docs || [])
    .map((x) => ({
      id: String(x.id || "").trim(),
      nome: String(x.nome || "").trim(),
      dica: String(x.dica || "").trim(),
      icone: String(x.icone || "doc").trim(),
      obrigatorio: !!x.obrigatorio,
    }))
    .filter((x) => x.id && x.nome);
}

// E-mail em minúsculas e sem espaços (usado como identificador de login)
function normalizarEmail_(email?: string): string {
  return String(email || "").trim().toLowerCase();
}

function validarEmail_(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Caracteres que o SharePoint não aceita (ou que quebram links) em nomes de arquivo e pasta
function nomeSeguro_(nome: string): string {
  return nome.replace(/[\\\/:*?"<>|#%]/g, "-").replace(/^[\s.]+|[\s.]+$/g, "");
}

function caminhoSite_(): string {
  return CONFIG.SITE_URL.replace(/^https?:\/\/[^/]+/, "").replace(/\/+$/, "");
}

function caminhoServidor_(caminho: string): string {
  return caminhoSite_() + caminho;
}

function urlDe_(caminho: string): string {
  const origem = (CONFIG.SITE_URL.match(/^https?:\/\/[^/]+/) || [""])[0];
  return origem + encodeURI(caminhoServidor_(caminho));
}

// Miniatura que o painel mostra (aparece quando o navegador está logado no Microsoft 365)
function miniaturaDe_(caminho: string): string {
  return `${CONFIG.SITE_URL.replace(/\/+$/, "")}/_layouts/15/getpreview.ashx?path=${encodeURIComponent(urlDe_(caminho))}`;
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
  const p = (n: number) => (n < 10 ? "0" : "") + n;
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}` + (comAno ? `-${d.getUTCFullYear()}` : "");
}

function nomeSemana_(data: Date): string {
  const local = dataLocal_(data);
  const recuo = (local.getUTCDay() + 6) % 7;
  const seg = new Date(data.getTime() - recuo * 86400e3);
  const dom = new Date(seg.getTime() + 6 * 86400e3);
  return `Semana ${dataBr_(seg, false)} a ${dataBr_(dom)}`;
}

function aleatorioHex_(tamanho: number): string {
  let s = "";
  while (s.length < tamanho) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

function sha256_(texto: string): string {
  // Bytes UTF-8
  const bytes: number[] = [];
  const cod = encodeURIComponent(texto);
  for (let i = 0; i < cod.length; i++) {
    if (cod[i] === "%") { bytes.push(parseInt(cod.substr(i + 1, 2), 16)); i += 2; } else bytes.push(cod.charCodeAt(i));
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
  return H.map((v) => ("00000000" + (v >>> 0).toString(16)).slice(-8)).join("");
}
