/* =========================================================================
   PAINEL DO RH
   Login → Dashboard / Candidatos / Configurações → detalhes do candidato
   ========================================================================= */

(() => {
  const cfg = window.APP_CONFIG;
  const { icon, esc } = U;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const CHAVE_TOKEN = 'portalAdmissao.token';
  const CHAVE_PAPEL = 'portalAdmissao.papel';
  const CHAVE_NOME = 'portalAdmissao.nome';
  const DIA = 864e5;
  const DIAS_PARADO = 2;

  // Última vez que o CANDIDATO fez algo (enviar ou marcar "não tenho").
  // Edições da Mariana no cadastro não contam como movimento.
  function ultimaAtividade(c) {
    let t = new Date(c.criadoEm).getTime() || 0;
    Object.values(c.docs || {}).forEach((x) => {
      [x.enviadoEm, x.puladoEm].forEach((v) => {
        const ms = v ? new Date(v).getTime() : 0;
        if (ms > t) t = ms;
      });
    });
    return t;
  }

  const diasDesde = (ms) => Math.floor((Date.now() - ms) / DIA);

  function precisaAtencao(c) {
    if (U.status(c) === 'concluido') return false;
    return U.progresso(c).pedidosReenvio.length > 0 || Date.now() - ultimaAtividade(c) > DIAS_PARADO * DIA;
  }

  // Fotos para refazer primeiro; depois quem está sem movimento há mais tempo
  function ordemAtencao(a, b) {
    const ra = U.progresso(a).pedidosReenvio.length ? 0 : 1;
    const rb = U.progresso(b).pedidosReenvio.length ? 0 : 1;
    return ra - rb || ultimaAtividade(a) - ultimaAtividade(b);
  }

  const A = {
    token: sessionStorage.getItem(CHAVE_TOKEN),
    papel: sessionStorage.getItem(CHAVE_PAPEL) || 'admin',
    nome: sessionStorage.getItem(CHAVE_NOME) || '',
    candidatos: [],
    aba: 'dashboard',
    filtro: { busca: '', status: 'todos', empresa: '', cargo: '' },
    aberto: null,
    periodo: 'mes',
    carregando: false,
    listaMontada: false,
    aoFecharModal: null,
    // Configurações: rascunho editável + cópia do que está salvo
    rascunho: null,
    salvo: '',
    config: { sub: 'geral', cargoSel: 0, msg: 'convite' },
  };

  // Papel de acesso: 'admin' faz tudo; 'leitura' só visualiza (sem botões de ação)
  const souAdmin = () => A.papel === 'admin';
  const somenteLeitura = () => !souAdmin();

  /* ---------- Auxiliares ---------- */
  $$('[data-icone]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icone, Number(el.dataset.tam) || 20)));

  const normalizar = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const spinner = (texto) => `<span class="spinner" aria-hidden="true"></span> ${texto}`;

  function corAvatar(nome) {
    let h = 0;
    for (const ch of String(nome)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `av-${h % 6}`;
  }
  const avatar = (nome, extra = '') => `<span class="avatar ${corAvatar(nome)} ${extra}" aria-hidden="true">${esc(U.iniciais(nome))}</span>`;

  function fmtDuracao(ms) {
    const horas = ms / 3600e3;
    if (horas < 1) return `${Math.max(1, Math.round(ms / 60000))} min`;
    if (horas < 24) return `${Math.round(horas)} h`;
    const dias = Math.floor(horas / 24);
    const resto = Math.round(horas - dias * 24);
    return `${plural(dias, 'dia', 'dias')}${resto ? ` e ${resto} h` : ''}`;
  }

  // Mostra *negrito* como no WhatsApp
  const formatarMsg = (msg) => esc(msg).replace(/\*(.+?)\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

  function mascaraTelefone(v) {
    const n = String(v || '').replace(/\D/g, '').slice(0, 11);
    if (n.length <= 2) return n.length ? `(${n}` : '';
    if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
    if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
    return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  }

  const semDDI = (tel) => String(tel || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');

  const vazio = (titulo, texto = '', ic = 'checkCircle', extra = '') => `
    <div class="vazio">
      <span class="vazio-icone">${icon(ic, 26)}</span>
      <strong>${titulo}</strong>
      ${texto ? `<span>${texto}</span>` : ''}
      ${extra}
    </div>`;

  const interruptor = (atributos, ligado, textoLigado, textoDesligado) => `
    <label class="interruptor">
      <input type="checkbox" ${atributos} ${ligado ? 'checked' : ''}>
      <span class="interruptor-trilho" aria-hidden="true"></span>
      <span class="interruptor-texto">${ligado ? textoLigado : textoDesligado}</span>
    </label>`;

  /* ================= LOGIN ================= */
  function mostrarLogin() {
    $('#tela-painel').hidden = true;
    $('#tela-login').hidden = false;
    setTimeout(() => ($('#email-login') || $('#senha')).focus(), 60);
  }

  function guardarSessao(resposta) {
    A.token = resposta.token;
    A.papel = resposta.papel === 'leitura' ? 'leitura' : 'admin';
    A.nome = resposta.nome || '';
    sessionStorage.setItem(CHAVE_TOKEN, A.token);
    sessionStorage.setItem(CHAVE_PAPEL, A.papel);
    sessionStorage.setItem(CHAVE_NOME, A.nome);
  }

  $('#ver-senha').addEventListener('click', (e) => {
    const campo = $('#senha');
    const mostrar = campo.type === 'password';
    campo.type = mostrar ? 'text' : 'password';
    e.currentTarget.innerHTML = icon(mostrar ? 'eyeOff' : 'eye', 20);
    e.currentTarget.setAttribute('aria-label', mostrar ? 'Esconder senha' : 'Mostrar senha');
  });

  $('#senha').addEventListener('input', () => $('#senha').removeAttribute('aria-invalid'));

  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const campoEmail = $('#email-login');
    const campo = $('#senha');
    const erro = $('#erro-login');
    const botao = $('#form-login button[type="submit"]');
    erro.innerHTML = '';
    const email = (campoEmail.value || '').trim();
    if (!email) {
      erro.innerHTML = `${icon('alert', 18)}Digite o seu e-mail.`;
      campoEmail.focus();
      return;
    }
    if (!campo.value) {
      erro.innerHTML = `${icon('alert', 18)}Digite a sua senha.`;
      campo.focus();
      return;
    }
    const original = botao.innerHTML;
    botao.disabled = true;
    botao.innerHTML = spinner('Entrando…');
    try {
      const resposta = await Api.chamar('admin.login', { email, senha: campo.value });
      guardarSessao(resposta);
      campo.value = '';
      entrarPainel();
    } catch (err) {
      erro.innerHTML = `${icon('alert', 18)}${esc(err.message)}`;
      campo.setAttribute('aria-invalid', 'true');
      campo.select();
    } finally {
      botao.disabled = false;
      botao.innerHTML = original;
    }
  });

  $('#btn-esqueci').addEventListener('click', modalEsqueciSenha);

  function modalEsqueciSenha() {
    const emailAtual = ($('#email-login') && $('#email-login').value || '').trim();
    const m = abrirModal(`
      <div class="modal-cabecalho">
        <div><h2>Esqueci a senha</h2><p>Enviaremos um código para o e-mail da sua conta.</p></div>
        <button type="button" class="btn btn-fantasma btn-icone btn-p" data-fechar-modal aria-label="Fechar">${icon('x')}</button>
      </div>
      <div class="modal-corpo">
        <div class="campo"><label for="rec-email">Seu e-mail</label><input id="rec-email" type="email" class="input" autocomplete="email" value="${esc(emailAtual)}" placeholder="nome@empresa.com.br"></div>
        <p class="msg-erro" id="rec-erro" role="alert"></p>
      </div>
      <div class="modal-rodape">
        <button type="button" class="btn btn-secundario" data-fechar-modal>Cancelar</button>
        <button type="button" class="btn btn-primario" id="rec-enviar">${icon('message', 18)} Enviar código</button>
      </div>`);

    setTimeout(() => m.querySelector('#rec-email').focus(), 60);
    m.querySelector('#rec-enviar').addEventListener('click', async (e) => {
      const email = (m.querySelector('#rec-email').value || '').trim();
      if (!email) { m.querySelector('#rec-erro').innerHTML = `${icon('alert', 18)}Digite o seu e-mail.`; return; }
      const botao = e.currentTarget;
      botao.disabled = true;
      botao.innerHTML = spinner('Enviando…');
      try {
        passoNovaSenha(await Api.chamar('admin.esqueciSenha', { email }));
      } catch (err) {
        m.querySelector('#rec-erro').innerHTML = `${icon('alert', 18)}${esc(err.message)}`;
        botao.disabled = false;
        botao.innerHTML = `${icon('message', 18)} Enviar código`;
      }
    });
  }

  function passoNovaSenha(resposta) {
    const m = abrirModal(`
      <form id="form-redefinir" novalidate>
        <div class="modal-cabecalho">
          <div><h2>Criar nova senha</h2><p>Enviamos um código para <strong>${esc(resposta.email)}</strong>. Confira também a caixa de spam.</p></div>
          <button type="button" class="btn btn-fantasma btn-icone btn-p" data-fechar-modal aria-label="Fechar">${icon('x')}</button>
        </div>
        <div class="modal-corpo">
          <div class="campo"><label for="r-codigo">Código recebido</label><input id="r-codigo" class="input" inputmode="numeric" maxlength="6" autocomplete="one-time-code" autofocus></div>
          <div class="campo"><label for="r-nova">Nova senha</label><input id="r-nova" type="password" class="input" autocomplete="new-password"><span class="ajuda-campo">Pelo menos 6 caracteres.</span></div>
          <div class="campo"><label for="r-conf">Repita a nova senha</label><input id="r-conf" type="password" class="input" autocomplete="new-password"></div>
          <p class="msg-erro" id="r-erro" role="alert"></p>
        </div>
        <div class="modal-rodape">
          <button type="button" class="btn btn-secundario" data-fechar-modal>Cancelar</button>
          <button type="submit" class="btn btn-primario">${icon('check', 18)} Salvar nova senha</button>
        </div>
      </form>`);

    m.querySelector('#form-redefinir').addEventListener('submit', async (e) => {
      e.preventDefault();
      const erro = m.querySelector('#r-erro');
      const codigo = m.querySelector('#r-codigo').value.replace(/\D/g, '');
      const nova = m.querySelector('#r-nova').value;
      const falhar = (msg) => { erro.innerHTML = `${icon('alert', 18)}${esc(msg)}`; };
      if (codigo.length !== 6) return falhar('Digite o código de 6 números.');
      if (nova.length < 6) return falhar('A nova senha precisa ter pelo menos 6 caracteres.');
      if (nova !== m.querySelector('#r-conf').value) return falhar('As duas senhas não são iguais.');

      const botao = e.target.querySelector('button[type="submit"]');
      botao.disabled = true;
      botao.innerHTML = spinner('Salvando…');
      try {
        await Api.chamar('admin.redefinirSenha', { codigo, novaSenha: nova });
        fecharModal();
        U.toast('Senha alterada! Entre com a nova senha.', 'sucesso');
        $('#senha').focus();
      } catch (err) {
        falhar(err.message);
        botao.disabled = false;
        botao.innerHTML = `${icon('check', 18)} Salvar nova senha`;
      }
    });
  }

  function sair() {
    sessionStorage.removeItem(CHAVE_TOKEN);
    sessionStorage.removeItem(CHAVE_PAPEL);
    sessionStorage.removeItem(CHAVE_NOME);
    A.token = null;
    A.papel = 'admin';
    A.candidatos = [];
    A.listaMontada = false;
    A.rascunho = null;
    $('#aba-candidatos').innerHTML = '';
    $('#aba-configuracoes').innerHTML = '';
    fecharDrawer();
    fecharModal();
    mostrarLogin();
  }

  $('#btn-sair').addEventListener('click', sair);

  /* ================= PAINEL ================= */
  function entrarPainel() {
    $('#tela-login').hidden = true;
    $('#tela-painel').hidden = false;
    aplicarPapelUI();
    if (somenteLeitura() && A.aba === 'configuracoes') A.aba = 'dashboard';
    atualizarIdentidade();
    trocarAba(A.aba);
    carregar();
  }

  // Modo leitura: esconde botões de ação (classe .acao-escrita) e a aba Configurações
  function aplicarPapelUI() {
    document.body.classList.toggle('painel-leitura', somenteLeitura());
    const selo = $('#selo-papel');
    if (selo) {
      selo.hidden = souAdmin();
      selo.textContent = 'Somente leitura';
    }
  }

  function atualizarIdentidade() {
    const nome = U.ajustes().nomeRh;
    $('#nome-rh').textContent = nome;
    $('#avatar-rh').textContent = U.iniciais(nome);
    if (A.aba === 'dashboard') {
      const h = new Date().getHours();
      const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
      const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
      $('#subtitulo-aba').textContent = `${saudacao}, ${nome}! Resumo de ${hoje}.`;
    }
  }

  async function carregar({ silencioso = false } = {}) {
    if (A.carregando || !A.token) return;
    A.carregando = true;
    const botao = $('#btn-atualizar');
    botao.classList.add('girando');
    if (!silencioso && !A.candidatos.length && A.aba === 'dashboard') renderEsqueleto();
    try {
      const { candidatos, ajustes, papel } = await Api.chamar('admin.listar', { token: A.token });
      A.candidatos = candidatos;
      if (papel && papel !== A.papel) {
        A.papel = papel === 'leitura' ? 'leitura' : 'admin';
        sessionStorage.setItem(CHAVE_PAPEL, A.papel);
        aplicarPapelUI();
        if (somenteLeitura() && A.aba === 'configuracoes') trocarAba('dashboard');
      }
      U.definirAjustes(ajustes);
      if (!configAlterada()) A.rascunho = null; // recarrega o rascunho com o que veio do servidor
      const agora = new Date();
      $('#atualizado-em').textContent = `Atualizado às ${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
      atualizarIdentidade();
      renderTudo();
    } catch (e) {
      tratarErro(e);
    } finally {
      A.carregando = false;
      botao.classList.remove('girando');
    }
  }

  function tratarErro(e) {
    U.toast(e.message, 'erro');
    if (e.codigo === 'SESSAO') sair();
  }

  function substituir(candidato) {
    const i = A.candidatos.findIndex((c) => c.codigo === candidato.codigo);
    if (i >= 0) A.candidatos[i] = candidato;
  }

  function renderTudo() {
    $('#contador-menu').textContent = A.candidatos.length || '';
    if (A.aba === 'dashboard') renderDashboard();
    else if (A.aba === 'candidatos') renderCandidatos();
    else if (!A.rascunho) renderConfiguracoes(); // não atrapalha quem está digitando
    if (A.aberto) renderDrawer();
  }

  const TITULOS = {
    dashboard: ['Dashboard', ''],
    candidatos: ['Candidatos', 'Gere códigos, acompanhe os envios e acesse os documentos.'],
    configuracoes: ['Configurações', 'Dados do RH, senha, empresas, documentos e mensagens.'],
  };

  async function trocarAba(aba) {
    if (A.aba === 'configuracoes' && aba !== 'configuracoes') {
      if (configAlterada()) {
        const ok = await confirmar({
          titulo: 'Sair sem salvar?',
          texto: 'Você mudou as configurações e ainda não salvou. Se sair agora, as mudanças serão perdidas.',
          botao: 'Sair sem salvar',
          perigo: true,
          icone: 'alert',
        });
        if (!ok) return;
      }
      A.rascunho = null;
    }

    A.aba = aba;
    $$('[data-aba]').forEach((b) => {
      if (b.dataset.aba === aba) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    ['dashboard', 'candidatos', 'configuracoes'].forEach((id) => { $(`#aba-${id}`).hidden = id !== aba; });
    $('#titulo-aba').textContent = TITULOS[aba][0];
    $('#subtitulo-aba').textContent = TITULOS[aba][1];

    if (aba === 'dashboard') { atualizarIdentidade(); renderDashboard(); }
    else if (aba === 'candidatos') renderCandidatos();
    else renderConfiguracoes();
    $('#conteudo').scrollIntoView({ block: 'start' });
  }

  /* ================= DASHBOARD ================= */
  function renderEsqueleto() {
    $('#aba-dashboard').innerHTML = `
      <div class="kpis">${'<div class="kpi esqueleto"></div>'.repeat(4)}</div>
      <div class="grade-dash"><div class="card span-2 esqueleto alto"></div><div class="card esqueleto alto"></div></div>`;
  }

  function metricas(cs) {
    const agora = Date.now();
    const a = U.ajustes();
    const por = { aguardando: 0, andamento: 0, concluido: 0 };
    cs.forEach((c) => por[U.status(c)]++);
    const total = cs.length;

    const atencao = cs.filter(precisaAtencao).sort(ordemAtencao);

    const duracoes = cs
      .filter((c) => c.concluidoEm)
      .map((c) => new Date(c.concluidoEm) - new Date(c.criadoEm))
      .filter((ms) => ms >= 0);

    const agrupar = (chave, base, rotulo) => {
      const mapa = new Map(base.map((k) => [k, { nome: rotulo(k), total: 0, concluidos: 0 }]));
      cs.forEach((c) => {
        const k = c[chave];
        if (!mapa.has(k)) mapa.set(k, { nome: rotulo(k), total: 0, concluidos: 0 });
        const g = mapa.get(k);
        g.total++;
        if (c.concluidoEm) g.concluidos++;
      });
      return [...mapa.values()].sort((x, y) => y.total - x.total);
    };

    return {
      por,
      total,
      taxa: total ? Math.round((por.concluido / total) * 100) : 0,
      novos7: cs.filter((c) => agora - new Date(c.criadoEm) < 7 * DIA).length,
      tempoMedio: duracoes.length ? duracoes.reduce((x, y) => x + y, 0) / duracoes.length : null,
      atencao,
      atencaoAndamento: atencao.filter((c) => U.status(c) === 'andamento').length,
      atencaoAguardando: atencao.filter((c) => U.status(c) === 'aguardando').length,
      recentes: cs.filter((c) => c.concluidoEm).sort((x, y) => new Date(y.concluidoEm) - new Date(x.concluidoEm)).slice(0, 5),
      porEmpresa: agrupar('empresa', a.empresas.filter((e) => e.ativa).map((e) => e.nome), (k) => k || 'Sem empresa'),
      porCargo: agrupar('cargo', a.cargos.filter((c) => c.ativo).map((c) => c.id), U.nomeCargo),
    };
  }

  const kpi = (ic, tom, rotulo, valor, rodape) => `
    <article class="kpi">
      <div class="kpi-topo"><span class="kpi-icone kpi-${tom}">${icon(ic, 20)}</span><span class="kpi-rotulo">${rotulo}</span></div>
      <strong class="kpi-valor">${valor}</strong>
      <span class="kpi-rodape">${rodape}</span>
    </article>`;

  const cabCard = (titulo, sub, direita = '') => `
    <header class="card-cab"><div><h2>${titulo}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${direita}</header>`;

  function renderDashboard() {
    const el = $('#aba-dashboard');
    if (!A.token) return;
    const m = metricas(A.candidatos);

    if (!m.total) {
      el.innerHTML = `<div class="card">${vazio('Nenhum candidato cadastrado ainda', 'Cadastre o primeiro candidato para gerar o código de acesso.', 'users',
        `<button class="btn btn-primario" data-novo>${icon('plus', 18)} Novo candidato</button>`)}</div>`;
      return;
    }

    el.innerHTML = `
      <div class="kpis">
        ${kpi('users', 'marca', 'Candidatos', m.total, m.novos7 ? `+${m.novos7} nos últimos 7 dias` : 'Nenhum novo nesta semana')}
        ${kpi('checkCircle', 'sucesso', 'Concluídos', m.por.concluido, `${m.taxa}% de conclusão`)}
        ${kpi('clock', 'alerta', 'Em andamento', m.por.andamento, m.atencaoAndamento ? `${plural(m.atencaoAndamento, 'precisa', 'precisam')} de atenção` : 'Tudo fluindo bem')}
        ${kpi('hourglass', 'neutro', 'Aguardando início', m.por.aguardando, m.atencaoAguardando ? `${m.atencaoAguardando} sem começar há mais de ${DIAS_PARADO} dias` : 'Ainda não enviaram nada')}
      </div>

      <div class="grade-dash">
        <section class="card span-2">
          ${graficoEnvios(A.candidatos)}
        </section>

        <section class="card">
          ${cabCard('Status geral', plural(m.total, 'candidato', 'candidatos'))}
          ${graficoStatus(m)}
        </section>

        <section class="card span-2">
          ${cabCard('Precisam de atenção', `Sem movimento há mais de ${DIAS_PARADO} dias ou com foto para refazer`, m.atencao.length ? `<span class="destaque-num">${m.atencao.length}</span>` : '')}
          ${listaAtencao(m.atencao)}
        </section>

        <section class="card">
          ${cabCard('Concluídos recentemente', 'Documentação completa')}
          ${listaRecentes(m.recentes)}
        </section>

        <section class="card span-2">
          ${cabCard('Por empresa', 'Total de candidatos')}
          ${barrasHorizontais(m.porEmpresa)}
        </section>

        <section class="card">
          ${cabCard('Por cargo', 'Total de candidatos')}
          ${barrasHorizontais(m.porCargo)}
        </section>
      </div>`;
  }

  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const SEMANA_CURTA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const PERIODOS = {
    semana: { rotulo: 'Semana', sub: 'Últimos 7 dias' },
    mes: { rotulo: 'Mês', sub: 'Últimos 30 dias' },
    ano: { rotulo: 'Ano', sub: 'Últimos 12 meses' },
  };
  const pad2 = (n) => String(n).padStart(2, '0');

  // Semana e mês: uma barra por dia · Ano: uma barra por mês
  function seriesEnvios(cs, periodo) {
    const datas = [];
    cs.forEach((c) => Object.values(c.docs || {}).forEach((x) => { if (x.enviadoEm) datas.push(new Date(x.enviadoEm)); }));
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    if (periodo === 'ano') {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
      const itens = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(inicio.getFullYear(), inicio.getMonth() + i, 1);
        return {
          valor: 0,
          rotulo: i === 11 ? 'Este mês' : `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
          titulo: `${MESES_LONGOS[d.getMonth()]} de ${d.getFullYear()}`,
          visivel: true,
        };
      });
      datas.forEach((d) => {
        const i = (d.getFullYear() - inicio.getFullYear()) * 12 + d.getMonth() - inicio.getMonth();
        if (i >= 0 && i < 12) itens[i].valor++;
      });
      return itens;
    }

    const n = periodo === 'semana' ? 7 : 30;
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - (n - 1));
    const itens = Array.from({ length: n }, (_, i) => {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      const ddmm = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
      return {
        valor: 0,
        rotulo: i === n - 1 ? 'Hoje' : n === 7 ? `${SEMANA_CURTA[d.getDay()]} ${pad2(d.getDate())}` : ddmm,
        titulo: `${SEMANA[d.getDay()]}, ${ddmm}`,
        visivel: n === 7 || (n - 1 - i) % 5 === 0,
      };
    });
    datas.forEach((d) => {
      const dia = new Date(d);
      dia.setHours(0, 0, 0, 0);
      const i = Math.round((dia - inicio) / DIA);
      if (i >= 0 && i < n) itens[i].valor++;
    });
    return itens;
  }

  function graficoEnvios(cs) {
    const periodo = A.periodo;
    const itens = seriesEnvios(cs, periodo);
    const total = itens.reduce((s, x) => s + x.valor, 0);
    const seletor = `
      <div class="segmentado segmentado-p" role="group" aria-label="Período do gráfico">
        ${Object.entries(PERIODOS).map(([id, p]) => `<button type="button" data-periodo="${id}" aria-pressed="${id === periodo}">${p.rotulo}</button>`).join('')}
      </div>`;
    return `
      ${cabCard('Documentos recebidos', `${PERIODOS[periodo].sub} · ${plural(total, 'documento', 'documentos')}`, `<div class="periodo-cab">${seletor}<span class="destaque-num">${total}</span></div>`)}
      ${graficoColunas(itens, periodo === 'mes')}`;
  }

  function graficoColunas(itens, denso) {
    const max = Math.max(...itens.map((d) => d.valor));
    const topo = Math.max(4, Math.ceil((max + 1) / 4) * 4);
    const ultimo = itens.length - 1;
    return `
      <div class="gcol ${denso ? 'gcol-denso' : ''}">
        <div class="gcol-eixo" aria-hidden="true"><span>${topo}</span><span>${topo / 2}</span><span>0</span></div>
        <div class="gcol-area">
          <div class="gcol-grade" aria-hidden="true"><i></i><i></i><i></i></div>
          <div class="gcol-barras">${itens.map((d) => `
            <div class="gcol-item" tabindex="0" data-tip-titulo="${esc(d.titulo)}" data-tip="${plural(d.valor, 'documento', 'documentos')}">
              <div class="gcol-barra" style="height:${(d.valor / topo) * 100}%"></div>
            </div>`).join('')}
          </div>
        </div>
        <div class="gcol-rotulos" aria-hidden="true">
          ${itens.map((d, i) => `<span class="${d.visivel ? '' : 'oculto'} ${i === ultimo ? 'hoje' : ''}">${esc(d.rotulo)}</span>`).join('')}
        </div>
      </div>
      <table class="sr-only">
        <caption>Documentos recebidos</caption>
        <tbody>${itens.map((d) => `<tr><th>${esc(d.titulo)}</th><td>${d.valor}</td></tr>`).join('')}</tbody>
      </table>`;
  }

  function graficoStatus(m) {
    const ordem = ['concluido', 'andamento', 'aguardando'];
    const pct = (k) => Math.round((m.por[k] / m.total) * 100);
    const segmentos = ordem.filter((k) => m.por[k]).map((k) => `
      <span class="seg seg-${k}" style="flex-grow:${m.por[k]}" data-tip-titulo="${U.STATUS[k].rotulo}" data-tip="${plural(m.por[k], 'candidato', 'candidatos')} · ${pct(k)}%"></span>`).join('');
    const legenda = ordem.map((k) => `
      <li><span class="legenda-cor seg-${k}"></span>${icon(U.STATUS[k].icone, 16)}<span>${U.STATUS[k].rotulo}</span><strong>${m.por[k]}</strong><small>${pct(k)}%</small></li>`).join('');

    return `
      <div class="status-grande"><strong>${m.taxa}%</strong><span>já concluíram</span></div>
      <div class="barra-empilhada" role="img" aria-label="${ordem.map((k) => `${U.STATUS[k].rotulo}: ${m.por[k]}`).join(', ')}">${segmentos}</div>
      <ul class="legenda">${legenda}</ul>
      <div class="mini-stat">${icon('clock', 22)}
        <div><small>Tempo médio para concluir</small><strong>${m.tempoMedio !== null ? fmtDuracao(m.tempoMedio) : '—'}</strong></div>
      </div>`;
  }

  function barrasHorizontais(grupos) {
    const max = Math.max(1, ...grupos.map((g) => g.total));
    return `<ul class="hbarras">${grupos.map((g) => `
      <li class="hbarra">
        <div class="hbarra-topo"><span>${esc(g.nome)}</span><strong>${g.total}</strong></div>
        <div class="hbarra-trilho" data-tip-titulo="${esc(g.nome)}" data-tip="${plural(g.total, 'candidato', 'candidatos')} · ${plural(g.concluidos, 'concluído', 'concluídos')}">
          <span style="width:${(g.total / max) * 100}%"></span>
        </div>
        <small>${plural(g.concluidos, 'concluído', 'concluídos')}</small>
      </li>`).join('')}</ul>`;
  }

  function listaAtencao(lista) {
    if (!lista.length) return vazio('Tudo em dia!', 'Nenhum candidato parado no momento.');
    const itens = lista.slice(0, 6).map((c) => {
      const p = U.progresso(c);
      const dias = diasDesde(ultimaAtividade(c));
      const refazer = p.pedidosReenvio;

      // Cada situação tem o selo, o texto e a mensagem de WhatsApp certos
      let selo;
      let detalhe;
      let mensagem;
      let acao;
      if (refazer.length) {
        selo = `<span class="badge badge-perigo">${icon('rotate', 12)} ${plural(refazer.length, 'foto para refazer', 'fotos para refazer')}</span>`;
        detalhe = `${esc(c.empresa)} · ${refazer.map((d) => esc(d.nome)).join(', ')}`;
        mensagem = U.mensagemNovaFoto(c, refazer.map((d) => d.nome).join(', '));
        acao = 'Avisar';
      } else if (U.status(c) === 'aguardando') {
        selo = `<span class="badge badge-neutro">${icon('hourglass', 12)} Não começou · ${plural(dias, 'dia', 'dias')}</span>`;
        detalhe = `${esc(c.empresa)} · cadastrado em ${U.fmtData(c.criadoEm)}`;
        mensagem = U.mensagemConvite(c);
        acao = 'Reenviar';
      } else {
        selo = `<span class="badge badge-alerta">${icon('clock', 12)} Parado há ${plural(dias, 'dia', 'dias')}</span>`;
        detalhe = `${esc(c.empresa)} · ${p.enviados} de ${p.total} documentos`;
        mensagem = U.mensagemCobranca(c);
        acao = 'Cobrar';
      }

      const botao = c.telefone
        ? `<a class="btn btn-whats btn-p" href="${esc(U.linkWhats(c.telefone, mensagem))}" target="_blank" rel="noopener" title="${acao} pelo WhatsApp">${icon('message', 16)}<span>${acao}</span></a>`
        : `<button class="btn btn-secundario btn-p" data-abrir="${c.codigo}" title="Sem WhatsApp cadastrado">Sem WhatsApp</button>`;
      return `
        <li>
          ${avatar(c.nome)}
          <div class="lp-info">
            <button class="lp-nome" data-abrir="${c.codigo}">${esc(c.nome)}</button>
            <small>${detalhe}</small>
          </div>
          ${selo}
          ${botao}
        </li>`;
    }).join('');
    const verTodos = lista.length > 6
      ? `<button class="btn btn-fantasma btn-p ver-todos" data-ir-status="atencao">Ver todos (${lista.length}) ${icon('arrowRight', 16)}</button>`
      : '';
    return `<ul class="lista-pessoas">${itens}</ul>${verTodos}`;
  }

  function listaRecentes(lista) {
    if (!lista.length) return vazio('Ninguém concluiu ainda', 'Os concluídos aparecem aqui.', 'hourglass');
    return `<ul class="lista-pessoas">${lista.map((c) => `
      <li>
        ${avatar(c.nome)}
        <div class="lp-info">
          <button class="lp-nome" data-abrir="${c.codigo}">${esc(c.nome)}</button>
          <small>Concluído ${U.tempoRelativo(c.concluidoEm)}</small>
        </div>
        ${c.pastaUrl
          ? `<a class="btn btn-secundario btn-icone btn-p" href="${esc(c.pastaUrl)}" target="_blank" rel="noopener" title="Abrir pasta no SharePoint" aria-label="Abrir pasta de ${esc(c.nome)} no SharePoint">${icon('folder', 16)}</a>`
          : `<button class="btn btn-secundario btn-icone btn-p" data-abrir="${c.codigo}" aria-label="Ver ${esc(c.nome)}">${icon('chevronRight', 16)}</button>`}
      </li>`).join('')}</ul>`;
  }

  /* ================= CANDIDATOS ================= */
  function renderCandidatos() {
    if (!A.token) return;
    const el = $('#aba-candidatos');
    if (!A.listaMontada) {
      const a = U.ajustes();
      const nomesEmpresas = [...new Set([...a.empresas.map((e) => e.nome), ...A.candidatos.map((c) => c.empresa).filter(Boolean)])];
      const idsCargos = [...new Set([...a.cargos.map((c) => c.id), ...A.candidatos.map((c) => c.cargo).filter(Boolean)])];
      const empresas = nomesEmpresas.map((e) => `<option>${esc(e)}</option>`).join('');
      const cargos = idsCargos.map((id) => `<option value="${esc(id)}">${esc(U.nomeCargo(id))}</option>`).join('');
      const botoesStatus = [['todos', 'Todos'], ['atencao', 'Precisam de atenção'], ['aguardando', 'Aguardando'], ['andamento', 'Em andamento'], ['concluido', 'Concluídos']]
        .map(([id, rot]) => `<button type="button" data-status="${id}" aria-pressed="false">${rot} <span>0</span></button>`).join('');

      el.innerHTML = `
        <div class="toolbar">
          <label class="busca">
            ${icon('search', 18)}
            <span class="sr-only">Buscar candidato</span>
            <input id="f-busca" type="search" class="input" placeholder="Buscar por nome, código ou telefone" autocomplete="off">
          </label>
          <div class="filtros-linha">
            <div class="segmentado" id="f-status" role="group" aria-label="Filtrar por status">${botoesStatus}</div>
            <select id="f-empresa" class="select select-p" aria-label="Filtrar por empresa"><option value="">Todas as empresas</option>${empresas}</select>
            <select id="f-cargo" class="select select-p" aria-label="Filtrar por cargo"><option value="">Todos os cargos</option>${cargos}</select>
          </div>
        </div>
        <div class="card card-tabela">
          <table class="tabela">
            <thead>
              <tr>
                <th scope="col">Candidato</th>
                <th scope="col">Código</th>
                <th scope="col">Empresa · Cargo</th>
                <th scope="col">Progresso</th>
                <th scope="col">Status</th>
                <th scope="col">Atualizado</th>
                <th scope="col"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody id="tbody"></tbody>
          </table>
          <div id="lista-vazia" hidden></div>
        </div>`;

      $('#f-busca').addEventListener('input', (e) => { A.filtro.busca = e.target.value; atualizarLista(); });
      $('#f-empresa').addEventListener('change', (e) => { A.filtro.empresa = e.target.value; atualizarLista(); });
      $('#f-cargo').addEventListener('change', (e) => { A.filtro.cargo = e.target.value; atualizarLista(); });
      $('#f-status').addEventListener('click', (e) => {
        const b = e.target.closest('[data-status]');
        if (!b) return;
        A.filtro.status = b.dataset.status;
        atualizarLista();
      });
      A.listaMontada = true;
    }
    $('#f-busca').value = A.filtro.busca;
    $('#f-empresa').value = A.filtro.empresa;
    $('#f-cargo').value = A.filtro.cargo;
    atualizarLista();
  }

  function atualizarLista() {
    const f = A.filtro;
    const termo = normalizar(f.busca);
    const digitos = f.busca.replace(/\D/g, '');

    const base = A.candidatos.filter((c) =>
      (!f.empresa || c.empresa === f.empresa) &&
      (!f.cargo || c.cargo === f.cargo) &&
      (!termo || normalizar(c.nome).includes(termo) ||
        (digitos && (c.codigo.includes(digitos) || String(c.telefone || '').includes(digitos)))));

    const contagem = { todos: base.length, atencao: base.filter(precisaAtencao).length, aguardando: 0, andamento: 0, concluido: 0 };
    base.forEach((c) => contagem[U.status(c)]++);
    $$('#f-status [data-status]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.status === f.status));
      b.querySelector('span').textContent = contagem[b.dataset.status];
    });

    const lista = base
      .filter((c) => f.status === 'todos' || (f.status === 'atencao' ? precisaAtencao(c) : U.status(c) === f.status))
      .sort((x, y) => new Date(y.atualizadoEm) - new Date(x.atualizadoEm));

    $('#tbody').innerHTML = lista.map(linhaCandidato).join('');
    $('.tabela').hidden = !lista.length;

    const caixaVazia = $('#lista-vazia');
    caixaVazia.hidden = lista.length > 0;
    if (!lista.length) {
      caixaVazia.innerHTML = A.candidatos.length
        ? vazio('Nenhum resultado', 'Tente outra busca ou limpe os filtros.', 'search', `<button class="btn btn-secundario" data-limpar>${icon('x', 18)} Limpar filtros</button>`)
        : vazio('Nenhum candidato ainda', 'Cadastre o primeiro para gerar o código.', 'users', `<button class="btn btn-primario" data-novo>${icon('plus', 18)} Novo candidato</button>`);
    }
  }

  function linhaCandidato(c) {
    const p = U.progresso(c);
    return `
      <tr data-abrir="${c.codigo}">
        <td data-rotulo="Candidato">
          <div class="cel-pessoa">${avatar(c.nome)}<div><strong>${esc(c.nome)}</strong><small>${esc(U.fmtTelefone(c.telefone)) || 'Sem telefone'}</small></div></div>
        </td>
        <td data-rotulo="Código">
          <button class="codigo-chip" data-copiar="${c.codigo}" title="Copiar código" aria-label="Copiar código ${c.codigo}">${c.codigo}${icon('copy', 14)}</button>
        </td>
        <td data-rotulo="Empresa"><div class="cel-2"><span>${esc(c.empresa)}</span><small>${esc(U.nomeCargo(c.cargo))}</small></div></td>
        <td data-rotulo="Progresso">
          <div class="cel-progresso">
            <div class="barra" role="progressbar" aria-label="Documentos enviados" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${p.resolvidos}"><span style="width:${p.pct}%"></span></div>
            <small>${p.enviados}/${p.total}</small>
          </div>
        </td>
        <td data-rotulo="Status">${U.badgeStatus(c)}</td>
        <td data-rotulo="Atualizado"><small class="muted" title="${U.fmtDataHora(c.atualizadoEm)}">${U.tempoRelativo(c.atualizadoEm)}</small></td>
        <td class="cel-acao">
          ${c.pastaUrl ? `<a class="btn btn-fantasma btn-icone btn-p" href="${esc(c.pastaUrl)}" target="_blank" rel="noopener" title="Abrir pasta no SharePoint" aria-label="Abrir pasta de ${esc(c.nome)} no SharePoint">${icon('folder', 16)}</a>` : ''}
          <button class="btn btn-secundario btn-p" data-abrir="${c.codigo}">Ver ${icon('chevronRight', 16)}</button>
        </td>
      </tr>`;
  }

  /* ================= DRAWER (detalhes) ================= */
  function abrirDrawer(codigo) {
    A.aberto = codigo;
    renderDrawer();
    const drawer = $('#drawer');
    drawer.hidden = false;
    $('#drawer-fundo').hidden = false;
    document.body.classList.add('sem-rolagem');
    requestAnimationFrame(() => requestAnimationFrame(() => drawer.classList.add('aberto')));
    setTimeout(() => { const b = $('#drawer [data-fechar]'); if (b) b.focus(); }, 60);
  }

  function fecharDrawer() {
    if (!A.aberto) return;
    A.aberto = null;
    $('#drawer').classList.remove('aberto');
    $('#drawer-fundo').hidden = true;
    document.body.classList.remove('sem-rolagem');
    setTimeout(() => { if (!A.aberto) $('#drawer').hidden = true; }, 300);
  }

  function renderDrawer() {
    const c = A.candidatos.find((x) => x.codigo === A.aberto);
    if (!c) return fecharDrawer();
    const p = U.progresso(c);
    const st = U.status(c);

    const docs = c.documentos.map((d) => {
      const x = c.docs[d.id];
      if (x && x.enviadoEm && !x.reenviar) {
        const miniatura = x.miniatura
          ? `<img src="${esc(x.miniatura)}" alt="" loading="lazy" onerror="this.remove()">`
          : x.previa ? `<img src="${x.previa}" alt="">` : '';
        return `
          <li class="doc-admin enviado">
            <div class="doc-thumb">${icon(x.tipo === 'application/pdf' ? 'file' : 'image', 22)}${miniatura}</div>
            <div class="doc-admin-info"><strong>${esc(d.nome)}</strong><small>${icon('check', 12)} Enviado ${U.fmtDataHora(x.enviadoEm)}</small></div>
            <div class="doc-admin-acoes">
              <button class="btn btn-secundario btn-p" data-ver="${d.id}">${icon('eye', 16)} Ver</button>
              <button class="btn btn-fantasma btn-icone btn-p" data-reenvio="${d.id}" title="Pedir nova foto" aria-label="Pedir nova foto de ${esc(d.nome)}">${icon('rotate', 16)}</button>
            </div>
          </li>`;
      }
      if (x && x.reenviar) {
        return `
          <li class="doc-admin refazer">
            <div class="doc-thumb">${icon('rotate', 22)}</div>
            <div class="doc-admin-info"><strong>${esc(d.nome)}</strong><small>Nova foto pedida ${U.tempoRelativo(x.pedidoEm)}</small></div>
          </li>`;
      }
      if (x && x.pulado) {
        return `
          <li class="doc-admin pulado">
            <div class="doc-thumb">${icon('ban', 22)}</div>
            <div class="doc-admin-info"><strong>${esc(d.nome)}</strong><small>Candidato informou que não possui</small></div>
          </li>`;
      }
      return `
        <li class="doc-admin pendente ${d.obrigatorio ? 'obrigatorio' : ''}">
          <div class="doc-thumb">${icon(d.icone, 22)}</div>
          <div class="doc-admin-info"><strong>${esc(d.nome)}</strong><small>${d.obrigatorio ? `${icon('clock', 12)} Pendente · obrigatório` : 'Opcional · não enviado'}</small></div>
        </li>`;
    }).join('');

    const botaoPasta = c.pastaUrl
      ? `<a class="btn btn-primario btn-bloco" href="${esc(c.pastaUrl)}" target="_blank" rel="noopener">${icon('folder')} Abrir pasta no SharePoint ${icon('external', 16)}</a>`
      : `<button class="btn btn-primario btn-bloco" disabled>${icon('folder')} Pasta ainda não criada</button>
         <p class="nota">${icon('help', 16)} A pasta é criada sozinha quando o candidato envia o primeiro documento.</p>`;

    const botaoWhats = c.telefone
      ? `<a class="btn btn-whats" href="${esc(U.linkWhats(c.telefone, U.mensagemConvite(c)))}" target="_blank" rel="noopener">${icon('message', 18)} Enviar código</a>`
      : `<button class="btn btn-secundario" data-copiar-msg>${icon('copy', 18)} Copiar convite</button>`;

    const botaoSecundario = st !== 'concluido' && c.telefone
      ? `<a class="btn btn-secundario acao-escrita" href="${esc(U.linkWhats(c.telefone, U.mensagemCobranca(c)))}" target="_blank" rel="noopener">${icon('clock', 18)} Cobrar pendências</a>`
      : `<button class="btn btn-secundario" data-copiar-msg>${icon('copy', 18)} Copiar mensagem</button>`;

    $('#drawer').innerHTML = `
      <header class="drawer-cab">
        <div class="cel-pessoa">
          ${avatar(c.nome, 'avatar-g')}
          <div>
            <h2 id="drawer-titulo">${esc(c.nome)}</h2>
            <div class="drawer-badges">${U.badgeStatus(c)}<span class="badge badge-marca">${p.enviados}/${p.total} documentos</span></div>
          </div>
        </div>
        <div class="drawer-cab-acoes">
          <button class="btn btn-secundario btn-p" data-editar>${icon('pencil', 16)} Editar</button>
          <button class="btn btn-fantasma btn-icone" data-fechar aria-label="Fechar detalhes">${icon('x', 22)}</button>
        </div>
      </header>

      <div class="drawer-corpo">
        <div class="drawer-acoes">
          ${botaoPasta}
          <div class="drawer-acoes-2">${botaoWhats}${botaoSecundario}</div>
        </div>

        <dl class="dados">
          <div><dt>Código</dt><dd><button class="codigo-chip" data-copiar="${c.codigo}" aria-label="Copiar código ${c.codigo}">${c.codigo}${icon('copy', 14)}</button></dd></div>
          <div><dt>WhatsApp</dt><dd>${esc(U.fmtTelefone(c.telefone)) || '—'}</dd></div>
          <div><dt>Empresa</dt><dd>${esc(c.empresa)}</dd></div>
          <div><dt>Cargo</dt><dd>${esc(U.nomeCargo(c.cargo))}</dd></div>
          <div><dt>Cadastrado em</dt><dd>${U.fmtData(c.criadoEm)}</dd></div>
          <div><dt>Concluído em</dt><dd>${c.concluidoEm ? U.fmtData(c.concluidoEm) : '—'}</dd></div>
        </dl>

        <section class="drawer-secao">
          <div class="drawer-secao-cab">
            <h3>Documentos</h3>
            <span class="muted">${plural(p.enviados, 'enviado', 'enviados')} · ${plural(p.pendentesObrigatorios.length, 'obrigatório pendente', 'obrigatórios pendentes')}</span>
          </div>
          <div class="barra"><span style="width:${p.pct}%"></span></div>
          <ul class="docs-admin">${docs}</ul>
        </section>

        <div class="zona-perigo">
          <div><strong>Excluir candidato</strong><small>Remove o cadastro e manda a pasta do SharePoint para a lixeira.</small></div>
          <button class="btn btn-perigo btn-p" data-excluir>${icon('trash', 16)} Excluir</button>
        </div>
      </div>`;
  }

  $('#drawer-fundo').addEventListener('click', fecharDrawer);

  $('#drawer').addEventListener('click', async (e) => {
    const c = A.candidatos.find((x) => x.codigo === A.aberto);
    if (!c) return;
    const alvo = e.target.closest('button');
    if (!alvo) return;

    if (alvo.hasAttribute('data-fechar')) fecharDrawer();
    else if (alvo.hasAttribute('data-editar')) modalCandidato(c);
    else if (alvo.hasAttribute('data-copiar-msg')) { await U.copiar(U.mensagemConvite(c)); U.toast('Mensagem copiada! Cole no WhatsApp.', 'sucesso'); }
    else if (alvo.dataset.copiar) { await U.copiar(alvo.dataset.copiar); U.toast(`Código ${alvo.dataset.copiar} copiado!`, 'sucesso'); }
    else if (alvo.dataset.ver) verDocumento(c, alvo.dataset.ver);
    else if (alvo.dataset.reenvio) pedirReenvio(c, alvo.dataset.reenvio);
    else if (alvo.hasAttribute('data-excluir')) excluir(c);
  });

  function verDocumento(c, docId) {
    const x = c.docs[docId];
    const d = c.documentos.find((y) => y.id === docId);
    if (x.url) {
      window.open(x.url, '_blank', 'noopener');
    } else if (x.previa) {
      abrirModal(`
        <div class="modal-cabecalho">
          <div><h2>${esc(d.nome)}</h2><p>${esc(c.nome)} · enviado ${U.fmtDataHora(x.enviadoEm)}</p></div>
          <button class="btn btn-fantasma btn-icone btn-p" data-fechar-modal aria-label="Fechar">${icon('x')}</button>
        </div>
        <div class="modal-corpo"><img class="lightbox-img" src="${x.previa}" alt="${esc(d.nome)} de ${esc(c.nome)}"></div>`);
    } else {
      U.toast('Não foi possível abrir este documento. Abra a pasta no SharePoint para vê-lo.', 'info');
    }
  }

  async function pedirReenvio(c, docId) {
    const d = c.documentos.find((x) => x.id === docId);
    const primeiro = U.primeiroNome(c.nome);
    const ok = await confirmar({
      titulo: 'Pedir uma nova foto?',
      texto: `O arquivo atual de <strong>${esc(d.nome)}</strong> vai para a lixeira e ${esc(primeiro)} verá um aviso no portal para enviar de novo.`,
      botao: 'Pedir nova foto',
      icone: 'rotate',
    });
    if (!ok) return;

    try {
      const { candidato } = await Api.chamar('admin.pedirReenvio', { token: A.token, codigo: c.codigo, docId });
      substituir(candidato);
      renderTudo();

      const msg = U.mensagemNovaFoto(candidato, d.nome);
      abrirModal(`
        <div class="modal-cabecalho">
          <div><h2>Pedido registrado</h2><p>Agora avise ${esc(primeiro)} pelo WhatsApp.</p></div>
          <button class="btn btn-fantasma btn-icone btn-p" data-fechar-modal aria-label="Fechar">${icon('x')}</button>
        </div>
        <div class="modal-corpo"><div class="previa-msg-fundo"><div class="previa-msg">${formatarMsg(msg)}</div></div></div>
        <div class="modal-rodape">
          <button class="btn btn-secundario" data-fechar-modal>Agora não</button>
          ${c.telefone
            ? `<a class="btn btn-whats" href="${esc(U.linkWhats(c.telefone, msg))}" target="_blank" rel="noopener" data-fechar-depois>${icon('message', 18)} Avisar no WhatsApp</a>`
            : `<button class="btn btn-primario" data-copiar-texto>${icon('copy', 18)} Copiar mensagem</button>`}
        </div>`, { texto: msg });
    } catch (e) {
      tratarErro(e);
    }
  }

  async function excluir(c) {
    const ok = await confirmar({
      titulo: `Excluir ${esc(c.nome)}?`,
      texto: 'O cadastro será removido e a pasta com os documentos irá para a lixeira do SharePoint.',
      botao: 'Sim, excluir',
      perigo: true,
    });
    if (!ok) return;
    try {
      await Api.chamar('admin.excluir', { token: A.token, codigo: c.codigo });
      A.candidatos = A.candidatos.filter((x) => x.codigo !== c.codigo);
      fecharDrawer();
      renderTudo();
      U.toast('Candidato excluído.', 'sucesso');
    } catch (e) {
      tratarErro(e);
    }
  }

  /* ================= MODAIS ================= */
  function abrirModal(html, { aoFechar, texto } = {}) {
    const raiz = $('#modal-raiz');
    raiz.innerHTML = `<div class="modal-fundo"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
    const fundo = raiz.firstElementChild;
    A.aoFecharModal = aoFechar || null;

    fundo.addEventListener('click', async (e) => {
      if (e.target === fundo || e.target.closest('[data-fechar-modal]')) fecharModal();
      else if (e.target.closest('[data-fechar-depois]')) setTimeout(fecharModal, 150);
      else if (e.target.closest('[data-copiar-texto]') && texto) {
        await U.copiar(texto);
        U.toast('Mensagem copiada! Cole no WhatsApp.', 'sucesso');
      }
    });

    const foco = fundo.querySelector('[autofocus]') || fundo.querySelector('input, select, button, a[href]');
    if (foco) foco.focus();
    return fundo;
  }

  function fecharModal() {
    const raiz = $('#modal-raiz');
    if (!raiz.firstElementChild) return;
    raiz.innerHTML = '';
    const fn = A.aoFecharModal;
    A.aoFecharModal = null;
    if (fn) fn();
  }

  function confirmar({ titulo, texto, botao = 'Confirmar', perigo = false, icone }) {
    return new Promise((resolve) => {
      let respondido = false;
      const m = abrirModal(`
        <div class="modal-corpo" style="padding-top:1.5rem">
          <div class="modal-icone ${perigo ? 'perigo' : ''}">${icon(icone || (perigo ? 'trash' : 'help'), 24)}</div>
          <h2>${titulo}</h2>
          <p class="muted">${texto}</p>
        </div>
        <div class="modal-rodape">
          <button class="btn btn-secundario" data-fechar-modal>Cancelar</button>
          <button class="btn ${perigo ? 'btn-perigo-cheio' : 'btn-primario'}" data-ok>${botao}</button>
        </div>`, { aoFechar: () => { if (!respondido) resolve(false); } });

      m.querySelector('[data-ok]').addEventListener('click', () => {
        respondido = true;
        fecharModal();
        resolve(true);
      });
    });
  }

  const resumoDocs = (docs) => JSON.stringify((docs || []).map((d) => [d.id, d.nome, d.dica, d.icone, !!d.obrigatorio]));

  // Cadastro novo (c = null) ou edição de um candidato existente
  function modalCandidato(c = null) {
    const a = U.ajustes();
    const editando = !!c;

    const nomesEmpresas = a.empresas.filter((e) => e.ativa).map((e) => e.nome);
    if (editando && c.empresa && !nomesEmpresas.includes(c.empresa)) nomesEmpresas.push(c.empresa);
    const cargos = a.cargos.filter((x) => x.ativo || (editando && x.id === c.cargo));

    if (!nomesEmpresas.length || !cargos.length) {
      U.toast('Antes, cadastre pelo menos uma empresa e um cargo em Configurações.', 'erro');
      return trocarAba('configuracoes');
    }

    const cargoInicial = editando ? c.cargo : cargos[0].id;
    const opcoesEmpresa = nomesEmpresas.map((n) => `<option ${editando && n === c.empresa ? 'selected' : ''}>${esc(n)}</option>`).join('');
    const opcoesCargo = cargos.map((x) => `
      <label class="opcao-cargo">
        <input type="radio" name="cargo" value="${esc(x.id)}" ${x.id === cargoInicial ? 'checked' : ''}>
        <span class="opcao-cargo-card">${icon(x.icone, 28)}<strong>${esc(x.nome)}</strong><small>${plural(x.documentos.length, 'documento', 'documentos')}</small></span>
      </label>`).join('');

    const m = abrirModal(`
      <form id="form-candidato" novalidate>
        <div class="modal-cabecalho">
          <div>
            <h2>${editando ? 'Editar cadastro' : 'Novo candidato'}</h2>
            <p>${editando ? `O código <strong>${c.codigo}</strong> continua o mesmo.` : 'Vamos gerar o código para o envio dos documentos.'}</p>
          </div>
          <button type="button" class="btn btn-fantasma btn-icone btn-p" data-fechar-modal aria-label="Fechar">${icon('x')}</button>
        </div>
        <div class="modal-corpo">
          <div class="campo">
            <label for="n-nome">Nome completo</label>
            <input id="n-nome" name="nome" class="input" autocomplete="off" placeholder="Ex.: João Batista da Silva" value="${editando ? esc(c.nome) : ''}" autofocus>
          </div>
          <div class="campo">
            <label for="n-tel">WhatsApp</label>
            <input id="n-tel" name="telefone" class="input" inputmode="tel" autocomplete="off" placeholder="(62) 99999-9999" value="${editando ? esc(mascaraTelefone(semDDI(c.telefone))) : ''}">
            <span class="ajuda-campo">Para enviar o código com um clique.</span>
          </div>
          <div class="campo">
            <label for="n-empresa">Empresa</label>
            <select id="n-empresa" name="empresa" class="select">${opcoesEmpresa}</select>
          </div>
          <fieldset class="campo campo-cargo">
            <legend>Cargo</legend>
            <div class="opcoes-cargo">${opcoesCargo}</div>
          </fieldset>
          <div id="aviso-cargo"></div>
          <p class="msg-erro" id="erro-candidato" role="alert"></p>
        </div>
        <div class="modal-rodape">
          <button type="button" class="btn btn-secundario" data-fechar-modal>Cancelar</button>
          <button type="submit" class="btn btn-primario">${editando ? `${icon('check', 18)} Salvar alterações` : `${icon('key', 18)} Gerar código`}</button>
        </div>
      </form>`);

    const form = m.querySelector('#form-candidato');
    const campo = (nome) => form.elements.namedItem(nome);
    const tel = campo('telefone');
    tel.addEventListener('input', () => { tel.value = mascaraTelefone(tel.value); tel.removeAttribute('aria-invalid'); });
    campo('nome').addEventListener('input', () => campo('nome').removeAttribute('aria-invalid'));

    function atualizarAvisoCargo() {
      const caixa = m.querySelector('#aviso-cargo');
      if (!editando) return;
      const escolhido = campo('cargo').value;
      const atual = U.cargo(escolhido);
      if (escolhido !== c.cargo) {
        caixa.innerHTML = `<div class="aviso aviso-alerta">${icon('alert', 20)}<div><strong>A lista de documentos vai mudar.</strong>Passa a ser a do cargo ${esc(U.nomeCargo(escolhido))}. O que já foi enviado continua salvo no SharePoint.</div></div>`;
      } else if (atual && resumoDocs(atual.documentos) !== resumoDocs(c.documentos)) {
        caixa.innerHTML = `<label class="aviso aviso-info" style="cursor:pointer"><input type="checkbox" name="atualizarDocs" style="margin-top:.2rem;width:18px;height:18px"><div><strong>A lista deste cargo mudou desde o cadastro.</strong>Marque para usar a lista atual. O que já foi enviado continua salvo.</div></label>`;
      } else {
        caixa.innerHTML = '';
      }
    }
    form.addEventListener('change', (e) => { if (e.target.name === 'cargo') atualizarAvisoCargo(); });
    atualizarAvisoCargo();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const erro = m.querySelector('#erro-candidato');
      const nome = campo('nome').value.trim().replace(/\s+/g, ' ');
      const telefone = tel.value.replace(/\D/g, '');
      const cargo = campo('cargo').value || (editando ? c.cargo : '');
      const empresa = campo('empresa').value;
      erro.innerHTML = '';

      if (nome.split(' ').length < 2) {
        erro.innerHTML = `${icon('alert', 18)}Digite o nome completo (nome e sobrenome).`;
        campo('nome').setAttribute('aria-invalid', 'true');
        campo('nome').focus();
        return;
      }
      if (telefone && telefone.length < 10) {
        erro.innerHTML = `${icon('alert', 18)}Confira o WhatsApp: coloque o DDD e o número.`;
        tel.setAttribute('aria-invalid', 'true');
        tel.focus();
        return;
      }
      const cargoObj = U.cargo(cargo);
      if (!editando && (!cargoObj || !cargoObj.documentos.length)) {
        erro.innerHTML = `${icon('alert', 18)}Esse cargo não tem documentos. Ajuste em Configurações.`;
        return;
      }

      const botao = form.querySelector('button[type="submit"]');
      const original = botao.innerHTML;
      botao.disabled = true;
      botao.innerHTML = spinner(editando ? 'Salvando…' : 'Gerando…');
      try {
        if (editando) {
          const marcouAtualizar = campo('atualizarDocs') && campo('atualizarDocs').checked;
          const trocarDocs = cargoObj && cargoObj.documentos.length && (cargo !== c.cargo || marcouAtualizar);
          const { candidato } = await Api.chamar('admin.editar', {
            token: A.token, codigo: c.codigo, nome, telefone, empresa, cargo,
            documentos: trocarDocs ? cargoObj.documentos : undefined,
          });
          substituir(candidato);
          A.listaMontada = false;
          renderTudo();
          fecharModal();
          U.toast('Cadastro atualizado!', 'sucesso');
        } else {
          const { candidato } = await Api.chamar('admin.criar', {
            token: A.token, nome, telefone, empresa, cargo, documentos: cargoObj.documentos,
          });
          A.candidatos.unshift(candidato);
          renderTudo();
          modalCodigoGerado(candidato);
        }
      } catch (err) {
        erro.innerHTML = `${icon('alert', 18)}${esc(err.message)}`;
        botao.disabled = false;
        botao.innerHTML = original;
        if (err.codigo === 'SESSAO') tratarErro(err);
      }
    });
  }

  function modalCodigoGerado(c) {
    const msg = U.mensagemConvite(c);
    abrirModal(`
      <div class="modal-cabecalho" style="justify-content:flex-end">
        <button class="btn btn-fantasma btn-icone btn-p" data-fechar-modal aria-label="Fechar">${icon('x')}</button>
      </div>
      <div class="modal-corpo centro" style="padding-top:0">
        <span class="selo-sucesso">${icon('check', 32)}</span>
        <h2>Código criado para ${esc(U.primeiroNome(c.nome))}!</h2>
        <p class="muted">Envie a mensagem abaixo. O link já leva direto para os documentos.</p>
        <div class="codigo-grande" aria-label="Código ${c.codigo}">${c.codigo.split('').map((n) => `<span>${n}</span>`).join('')}</div>
        <div class="previa-msg-fundo"><div class="previa-msg">${formatarMsg(msg)}</div></div>
      </div>
      <div class="modal-rodape">
        <button class="btn btn-secundario" data-copiar-texto>${icon('copy', 18)} Copiar mensagem</button>
        ${c.telefone
          ? `<a class="btn btn-whats" href="${esc(U.linkWhats(c.telefone, msg))}" target="_blank" rel="noopener" data-fechar-depois>${icon('message', 18)} Enviar pelo WhatsApp</a>`
          : `<button class="btn btn-primario" data-fechar-modal>Concluir</button>`}
      </div>`, { texto: msg });
  }

  /* ================= CONFIGURAÇÕES ================= */
  const ICONES_DOC = [
    ['idCard', 'Documento com foto'], ['file', 'Papel / certidão'], ['home', 'Endereço'], ['briefcase', 'Trabalho'],
    ['graduation', 'Estudo'], ['shieldCheck', 'Certidão / segurança'], ['bank', 'Banco'], ['user', 'Foto da pessoa'],
    ['award', 'Certificado / curso'], ['heart', 'Família'],
  ];
  const ICONES_CARGO = [
    ['bus', 'Motorista / transporte'], ['briefcase', 'Escritório'], ['building', 'Loja / prédio'], ['user', 'Atendimento'],
    ['shieldCheck', 'Segurança'], ['home', 'Limpeza / serviços'], ['award', 'Especialista'],
  ];
  const TIPOS_MSG = {
    convite: { rotulo: 'Convite', titulo: 'Mensagem de envio do código', descricao: 'Usada em "Novo candidato" e no botão "Enviar código".' },
    cobranca: { rotulo: 'Cobrança', titulo: 'Mensagem de cobrança', descricao: 'Usada nos botões "Cobrar" do dashboard e dos detalhes do candidato.' },
    novaFoto: { rotulo: 'Nova foto', titulo: 'Pedido de nova foto', descricao: 'Usada quando você pede para o candidato refazer uma foto.' },
  };

  const configAlterada = () => !!A.rascunho && JSON.stringify(A.rascunho) !== A.salvo;

  function iniciarRascunho() {
    const a = U.ajustes();
    A.rascunho = {
      nomeRh: a.nomeRh,
      whatsappRh: semDDI(a.whatsappRh),
      empresas: a.empresas.map((e) => ({ original: e.nome, nome: e.nome, ativa: e.ativa })),
      cargos: JSON.parse(JSON.stringify(a.cargos)),
      mensagens: { ...a.mensagens },
    };
    A.salvo = JSON.stringify(A.rascunho);
  }

  function atualizarBarraSalvar() {
    const barra = $('#barra-salvar');
    if (barra) barra.hidden = !configAlterada();
  }

  const cabConfig = (ic, titulo, texto) => `
    <header class="config-cab">
      <span class="config-icone">${icon(ic, 20)}</span>
      <div><h2>${titulo}</h2><p>${texto}</p></div>
    </header>`;

  function renderConfiguracoes() {
    if (!A.token) return;
    if (!A.rascunho) iniciarRascunho();
    const rolagem = window.scrollY;
    let sub = A.config.sub;
    const abas = [['geral', 'settings', 'Geral'], ['empresas', 'building', 'Empresas'], ['cargos', 'briefcase', 'Cargos e documentos'], ['mensagens', 'message', 'Mensagens'], ['usuarios', 'users', 'Usuários']];
    const render = { geral: configGeral, empresas: configEmpresas, cargos: configCargos, mensagens: configMensagens, usuarios: configUsuarios };
    if (!render[sub]) { sub = 'geral'; A.config.sub = 'geral'; }
    const conteudo = render[sub]();

    $('#aba-configuracoes').innerHTML = `
      <nav class="config-abas" aria-label="Partes das configurações">
        ${abas.map(([id, ic, rot]) => `<button type="button" data-config-aba="${id}" ${sub === id ? 'aria-current="page"' : ''}>${icon(ic, 18)}<span>${rot}</span></button>`).join('')}
      </nav>
      <div id="config-conteudo">${conteudo}</div>
      <div class="barra-salvar" id="barra-salvar" hidden>
        <span>${icon('alert', 18)} Você tem alterações não salvas</span>
        <div>
          <button type="button" class="btn btn-secundario" data-descartar>Descartar</button>
          <button type="button" class="btn btn-primario" data-salvar>${icon('check', 18)} Salvar alterações</button>
        </div>
      </div>`;

    atualizarBarraSalvar();
    if (sub === 'mensagens') atualizarPreviaMsg();
    window.scrollTo(0, rolagem);
  }

  /* ---------- Geral ---------- */
  function configGeral() {
    const r = A.rascunho;
    return `
      <section class="card config-secao">
        ${cabConfig('user', 'Dados do RH', 'Aparecem para o candidato e nas mensagens, no lugar de {rh}.')}
        <div class="config-grade">
          <div class="campo">
            <label for="c-nome-rh">Nome de quem atende</label>
            <input id="c-nome-rh" class="input" data-campo="nomeRh" value="${esc(r.nomeRh)}" maxlength="60">
          </div>
          <div class="campo">
            <label for="c-whats-rh">WhatsApp do RH</label>
            <input id="c-whats-rh" class="input" data-campo="whatsappRh" inputmode="tel" value="${esc(mascaraTelefone(r.whatsappRh))}" placeholder="(62) 99999-9999">
            <span class="ajuda-campo">Usado no botão "Falar com o RH" do portal do candidato.</span>
          </div>
        </div>
      </section>

      <section class="card config-secao">
        ${cabConfig('lock', 'Trocar minha senha', 'A troca é salva na hora, separada das outras configurações. Se esquecer a senha, use "Esqueci a senha" na tela de entrada — o código chega no seu próprio e-mail de acesso.')}
        <form id="form-senha" class="config-grade" novalidate>
          <div class="campo"><label for="s-atual">Senha atual</label><input id="s-atual" type="password" class="input" autocomplete="current-password"></div>
          <div class="campo"><label for="s-nova">Nova senha</label><input id="s-nova" type="password" class="input" autocomplete="new-password"><span class="ajuda-campo">Pelo menos 6 caracteres.</span></div>
          <div class="campo"><label for="s-conf">Repita a nova senha</label><input id="s-conf" type="password" class="input" autocomplete="new-password"></div>
          <div class="campo campo-acao"><button type="submit" class="btn btn-secundario">${icon('key', 18)} Trocar senha</button></div>
          <p class="msg-erro" id="erro-senha" role="alert"></p>
        </form>
      </section>`;
  }

  async function trocarSenha(form) {
    const erro = $('#erro-senha');
    const atual = $('#s-atual').value;
    const nova = $('#s-nova').value;
    const falhar = (msg, campo) => { erro.innerHTML = `${icon('alert', 18)}${esc(msg)}`; if (campo) campo.focus(); };
    erro.innerHTML = '';
    if (!atual) return falhar('Digite a senha atual.', $('#s-atual'));
    if (nova.length < 6) return falhar('A nova senha precisa ter pelo menos 6 caracteres.', $('#s-nova'));
    if (nova !== $('#s-conf').value) return falhar('As duas senhas novas não são iguais.', $('#s-conf'));

    const botao = form.querySelector('button[type="submit"]');
    const original = botao.innerHTML;
    botao.disabled = true;
    botao.innerHTML = spinner('Trocando…');
    try {
      await Api.chamar('admin.trocarSenha', { token: A.token, senhaAtual: atual, novaSenha: nova });
      form.reset();
      U.toast('Senha alterada com sucesso!', 'sucesso');
    } catch (err) {
      if (err.codigo === 'SESSAO') tratarErro(err);
      else falhar(err.message);
    } finally {
      botao.disabled = false;
      botao.innerHTML = original;
    }
  }

  /* ---------- Empresas ---------- */
  const candidatosDaEmpresa = (e) => (e.original ? A.candidatos.filter((c) => c.empresa === e.original).length : 0);

  function infoEmpresa(e) {
    const n = candidatosDaEmpresa(e);
    const renomeada = e.original && e.nome.trim() && e.original !== e.nome.trim();
    if (renomeada && n) return `${icon('alert', 12)} Ao salvar, ${plural(n, 'candidato será atualizado', 'candidatos serão atualizados')} para o novo nome.`;
    if (!e.original) return 'Nova · será criada ao salvar';
    return n ? plural(n, 'candidato', 'candidatos') : 'Nenhum candidato ainda';
  }

  function configEmpresas() {
    const itens = A.rascunho.empresas.map((e, i) => `
      <li class="linha-config ${e.ativa ? '' : 'inativa'}">
        <span class="linha-icone">${icon('building', 20)}</span>
        <div class="linha-principal">
          <input class="input input-p" value="${esc(e.nome)}" data-emp-nome="${i}" aria-label="Nome da empresa" maxlength="80" placeholder="Nome da empresa">
          <small class="muted" data-emp-info="${i}">${infoEmpresa(e)}</small>
        </div>
        ${interruptor(`data-emp-ativa="${i}" aria-label="Empresa ativa"`, e.ativa, 'Ativa', 'Inativa')}
        ${candidatosDaEmpresa(e) === 0
          ? `<button type="button" class="btn btn-fantasma btn-icone btn-p" data-emp-remover="${i}" aria-label="Remover ${esc(e.nome)}" title="Remover">${icon('trash', 16)}</button>`
          : '<span class="espaco-icone" aria-hidden="true"></span>'}
      </li>`).join('');

    return `
      <section class="card config-secao">
        ${cabConfig('building', 'Empresas', 'Aparecem no cadastro de candidatos. Empresa com candidatos não pode ser removida: desative para ela sumir do cadastro sem perder o histórico.')}
        <ul class="lista-config">${itens || '<li class="muted">Nenhuma empresa cadastrada.</li>'}</ul>
        <form id="form-add-empresa" class="add-linha" novalidate>
          <input id="nova-empresa" class="input" placeholder="Nome da nova empresa" maxlength="80" aria-label="Nome da nova empresa">
          <button type="submit" class="btn btn-secundario">${icon('plus', 18)} Adicionar empresa</button>
        </form>
      </section>`;
  }

  /* ---------- Cargos e documentos ---------- */
  const candidatosDoCargo = (id) => A.candidatos.filter((c) => c.cargo === id).length;
  const opcoes = (lista, atual) => lista.map(([id, rot]) => `<option value="${id}" ${id === atual ? 'selected' : ''}>${rot}</option>`).join('');

  function configCargos() {
    const r = A.rascunho;
    if (A.config.cargoSel >= r.cargos.length) A.config.cargoSel = 0;
    const selecionado = r.cargos[A.config.cargoSel];

    const lista = r.cargos.map((c, i) => `
      <button type="button" class="cargo-item ${i === A.config.cargoSel ? 'ativo' : ''} ${c.ativo ? '' : 'inativa'}" data-cargo-sel="${i}">
        <span class="linha-icone">${icon(c.icone || 'briefcase', 20)}</span>
        <span class="cargo-item-info"><strong>${esc(c.nome || 'Sem nome')}</strong><small>${plural(c.documentos.length, 'documento', 'documentos')}${c.ativo ? '' : ' · inativo'}</small></span>
        ${icon('chevronRight', 18)}
      </button>`).join('');

    return `
      <div class="config-cargos">
        <section class="card config-secao cargos-lista">
          ${cabConfig('briefcase', 'Cargos', 'Escolha um cargo para editar a lista de documentos.')}
          <div class="cargos-itens">${lista}</div>
          <button type="button" class="btn btn-secundario btn-bloco" data-cargo-add>${icon('plus', 18)} Novo cargo</button>
        </section>
        ${selecionado ? editorCargo(selecionado) : `<section class="card">${vazio('Nenhum cargo', 'Crie um cargo para montar a lista de documentos.', 'briefcase')}</section>`}
      </div>`;
  }

  function editorCargo(c) {
    const n = candidatosDoCargo(c.id);
    const obrig = c.documentos.filter((d) => d.obrigatorio).length;
    const ultimo = c.documentos.length - 1;

    const docs = c.documentos.map((d, j) => `
      <li class="doc-editor">
        <div class="doc-editor-topo">
          <span class="doc-editor-num">${j + 1}</span>
          <input class="input input-p" value="${esc(d.nome)}" data-doc-campo="nome" data-doc="${j}" placeholder="Nome do documento" aria-label="Nome do documento ${j + 1}" maxlength="80">
          <div class="doc-editor-acoes">
            <button type="button" class="btn btn-fantasma btn-icone btn-p" data-doc-mover="${j}" data-direcao="-1" ${j === 0 ? 'disabled' : ''} aria-label="Subir" title="Subir">${icon('arrowUp', 16)}</button>
            <button type="button" class="btn btn-fantasma btn-icone btn-p" data-doc-mover="${j}" data-direcao="1" ${j === ultimo ? 'disabled' : ''} aria-label="Descer" title="Descer">${icon('arrowDown', 16)}</button>
            <button type="button" class="btn btn-fantasma btn-icone btn-p btn-remover" data-doc-remover="${j}" aria-label="Remover ${esc(d.nome || 'documento')}" title="Remover">${icon('trash', 16)}</button>
          </div>
        </div>
        <textarea class="input textarea" rows="2" data-doc-campo="dica" data-doc="${j}" maxlength="400"
                  placeholder="Explicação simples para o candidato (também é lida em voz alta)" aria-label="Explicação do documento ${j + 1}">${esc(d.dica)}</textarea>
        <div class="doc-editor-rodape">
          <label class="select-rotulo">Ícone <select class="select select-p" data-doc-campo="icone" data-doc="${j}">${opcoes(ICONES_DOC, d.icone)}</select></label>
          ${interruptor(`data-doc-obrig="${j}"`, d.obrigatorio, 'Obrigatório', 'Opcional ("Não tenho")')}
        </div>
      </li>`).join('');

    return `
      <section class="card config-secao editor-cargo">
        <div class="config-grade">
          <div class="campo"><label for="cargo-nome">Nome do cargo</label><input id="cargo-nome" class="input" data-cargo-campo="nome" value="${esc(c.nome)}" maxlength="60" placeholder="Ex.: Auxiliar de limpeza"></div>
          <div class="campo"><label for="cargo-icone">Ícone</label><select id="cargo-icone" class="select" data-cargo-campo="icone">${opcoes(ICONES_CARGO, c.icone)}</select></div>
        </div>
        <div class="editor-cargo-status">
          ${interruptor('data-cargo-ativo', c.ativo, 'Ativo no cadastro', 'Inativo (não aparece no cadastro)')}
          ${n
            ? `<small class="muted">${plural(n, 'candidato usa', 'candidatos usam')} este cargo</small>`
            : `<button type="button" class="btn btn-perigo btn-p" data-cargo-remover>${icon('trash', 16)} Remover cargo</button>`}
        </div>
        <div class="aviso aviso-info">${icon('help', 20)}<div class="texto-corrido">Mudanças na lista valem para <strong>novos cadastros</strong>. Para um candidato já cadastrado, abra os detalhes dele e use <strong>Editar</strong>.</div></div>
        <div class="drawer-secao-cab">
          <h3>Documentos pedidos</h3>
          <span class="muted">${plural(obrig, 'obrigatório', 'obrigatórios')} · ${plural(c.documentos.length - obrig, 'opcional', 'opcionais')}</span>
        </div>
        <ol class="docs-editor">${docs || '<li class="muted">Nenhum documento ainda.</li>'}</ol>
        <button type="button" class="btn btn-secundario btn-bloco" data-doc-add>${icon('plus', 18)} Adicionar documento</button>
      </section>`;
  }

  /* ---------- Mensagens ---------- */
  function configMensagens() {
    const tipo = A.config.msg;
    const t = TIPOS_MSG[tipo];
    const variaveis = U.VARIAVEIS.filter((v) => !v.so || v.so === tipo);
    return `
      <section class="card config-secao">
        ${cabConfig('message', 'Mensagens do WhatsApp', 'Textos prontos que aparecem nos botões de WhatsApp do painel.')}
        <div class="segmentado" role="group" aria-label="Escolha a mensagem">
          ${Object.entries(TIPOS_MSG).map(([id, x]) => `<button type="button" data-msg-tipo="${id}" aria-pressed="${id === tipo}">${x.rotulo}</button>`).join('')}
        </div>
        <div class="editor-msg">
          <div class="editor-msg-texto">
            <div><label for="c-msg" class="rotulo">${t.titulo}</label><p class="ajuda-campo">${t.descricao}</p></div>
            <textarea id="c-msg" class="input textarea" rows="13" maxlength="3000">${esc(paraAmigavel(A.rascunho.mensagens[tipo]))}</textarea>
            <div class="variaveis">
              <div>
                <strong class="variaveis-titulo">Colocar informações do candidato</strong>
                <p class="ajuda-campo">Clique no lugar do texto onde quer a informação e depois no botão. Quando a mensagem for enviada, cada candidato recebe os próprios dados: <strong>[Primeiro nome]</strong> vira <strong>João</strong>, por exemplo.</p>
              </div>
              <div class="variaveis-lista">
                ${variaveis.map((v) => `
                  <button type="button" class="chip-var" data-var="${v.chave}">
                    ${icon('plus', 14)}<span class="chip-var-rotulo">${esc(v.rotulo)}</span><span class="chip-var-exemplo">ex.: ${esc(v.exemplo)}</span>
                  </button>`).join('')}
              </div>
            </div>
            <div id="aviso-msg"></div>
            <div class="editor-msg-dicas">
              <span class="ajuda-campo">Dica: *asteriscos* deixam o texto em <strong>negrito</strong> no WhatsApp.</span>
              <button type="button" class="btn btn-fantasma btn-p" data-msg-restaurar>${icon('rotate', 16)} Restaurar texto padrão</button>
            </div>
          </div>
          <div class="editor-msg-previa">
            <span class="rotulo">Prévia</span>
            <div class="celular">
              <div class="celular-topo">${avatar('João Batista')}<div><strong>João Batista</strong><small>online</small></div></div>
              <div class="celular-conversa"><div class="previa-msg" id="previa-msg"></div></div>
            </div>
            <small class="muted">Exemplo com um candidato fictício.</small>
          </div>
        </div>
      </section>`;
  }

  // No editor a pessoa vê [Primeiro nome]; por dentro fica guardado {primeiro_nome}
  const rotuloDe = (chave) => (U.VARIAVEIS.find((v) => v.chave === chave) || {}).rotulo;
  const paraAmigavel = (texto) => String(texto || '').replace(/\{(\w+)\}/g, (trecho, chave) => (rotuloDe(chave) ? `[${rotuloDe(chave)}]` : trecho));
  function paraInterno(texto) {
    return String(texto || '').replace(/\[([^[\]\n]{1,40})\]/g, (trecho, rotulo) => {
      const v = U.VARIAVEIS.find((x) => normalizar(x.rotulo) === normalizar(rotulo));
      return v ? `{${v.chave}}` : trecho;
    });
  }

  function candidatoExemplo() {
    const r = A.rascunho;
    const cargo = r.cargos.find((c) => c.ativo) || r.cargos[0] || { id: '', documentos: [] };
    const obrigatorios = cargo.documentos.filter((d) => d.obrigatorio);
    const docs = {};
    obrigatorios.slice(0, Math.max(0, obrigatorios.length - 2)).forEach((d) => { docs[d.id] = { enviadoEm: new Date().toISOString() }; });
    return {
      nome: 'João Batista da Silva',
      codigo: '482915',
      cargo: cargo.id,
      empresa: (r.empresas.find((e) => e.ativa) || { nome: 'Empresa' }).nome,
      documentos: cargo.documentos,
      docs,
    };
  }

  function atualizarPreviaMsg() {
    const tipo = A.config.msg;
    const modelo = A.rascunho.mensagens[tipo];
    const exemplo = candidatoExemplo();
    const texto = U.mensagem(tipo, exemplo, {
      modelo: modelo.trim() ? modelo : cfg.MENSAGENS[tipo],
      rh: A.rascunho.nomeRh,
      documento: (exemplo.documentos[0] || {}).nome || 'RG – frente',
    });
    $('#previa-msg').innerHTML = formatarMsg(texto);

    const avisos = [];
    if (!modelo.trim()) avisos.push('A mensagem está vazia. Ao salvar, o texto padrão será usado.');
    else {
      if (tipo !== 'novaFoto' && !modelo.includes('{link}') && !modelo.includes('{codigo}')) avisos.push('Coloque o [Link do portal] ou o [Código], senão o candidato não consegue entrar.');
      if (tipo === 'novaFoto' && !modelo.includes('{documento}')) avisos.push('Coloque o [Documento da foto], senão o candidato não vai saber qual foto refazer.');
      const desconhecidas = [...new Set([...modelo.matchAll(/\[([^[\]\n]{1,40})\]/g)].map((x) => x[0]))];
      if (desconhecidas.length) avisos.push(`Não reconheci ${desconhecidas.join(', ')}. Para colocar informações do candidato, use os botões abaixo do texto.`);
    }
    $('#aviso-msg').innerHTML = avisos.length
      ? `<div class="aviso aviso-alerta">${icon('alert', 20)}<div>${avisos.map(esc).join('<br>')}</div></div>`
      : '';
  }

  /* ---------- Salvar ---------- */
  function validarRascunho(r) {
    const repetido = (lista) => new Set(lista.map(normalizar)).size !== lista.length;
    if (!r.nomeRh.trim()) return ['geral', 'Informe o nome de quem atende no RH.'];
    if (r.empresas.some((e) => !e.nome.trim())) return ['empresas', 'Tem uma empresa sem nome.'];
    if (repetido(r.empresas.map((e) => e.nome))) return ['empresas', 'Tem duas empresas com o mesmo nome.'];
    if (!r.empresas.some((e) => e.ativa)) return ['empresas', 'Deixe pelo menos uma empresa ativa.'];
    for (let i = 0; i < r.cargos.length; i++) {
      const c = r.cargos[i];
      const falha = (msg) => { A.config.cargoSel = i; return ['cargos', msg]; };
      if (!c.nome.trim()) return falha('Tem um cargo sem nome.');
      if (!c.documentos.length) return falha(`O cargo "${c.nome}" não tem nenhum documento.`);
      if (c.documentos.some((d) => !d.nome.trim())) return falha(`Tem um documento sem nome em "${c.nome}".`);
    }
    if (repetido(r.cargos.map((c) => c.nome))) return ['cargos', 'Tem dois cargos com o mesmo nome.'];
    if (!r.cargos.some((c) => c.ativo)) return ['cargos', 'Deixe pelo menos um cargo ativo.'];
    return null;
  }

  async function salvarAjustes(botao) {
    const r = A.rascunho;
    const erro = validarRascunho(r);
    if (erro) {
      A.config.sub = erro[0];
      renderConfiguracoes();
      U.toast(erro[1], 'erro');
      return;
    }

    const renomear = r.empresas
      .filter((e) => e.original && e.original !== e.nome.trim())
      .map((e) => ({ de: e.original, para: e.nome.trim() }));

    const ajustes = {
      nomeRh: r.nomeRh.trim(),
      whatsappRh: r.whatsappRh.replace(/\D/g, ''),
      empresas: r.empresas.map((e) => ({ nome: e.nome.trim(), ativa: e.ativa })),
      cargos: r.cargos.map((c) => ({
        id: c.id, nome: c.nome.trim(), icone: c.icone, ativo: c.ativo,
        documentos: c.documentos.map((d) => ({ id: d.id, nome: d.nome.trim(), dica: (d.dica || '').trim(), icone: d.icone, obrigatorio: !!d.obrigatorio })),
      })),
      mensagens: { ...r.mensagens },
    };

    botao.disabled = true;
    botao.innerHTML = spinner('Salvando…');
    try {
      const resposta = await Api.chamar('admin.salvarAjustes', { token: A.token, ajustes, renomear });
      U.definirAjustes(resposta.ajustes);
      A.candidatos = resposta.candidatos;
      A.listaMontada = false;
      $('#aba-candidatos').innerHTML = '';
      iniciarRascunho();
      renderConfiguracoes();
      atualizarIdentidade();
      $('#contador-menu').textContent = A.candidatos.length || '';
      U.toast('Configurações salvas!', 'sucesso');
    } catch (err) {
      tratarErro(err);
      botao.disabled = false;
      botao.innerHTML = `${icon('check', 18)} Salvar alterações`;
    }
  }

  /* ---------- Eventos da aba ---------- */
  const abaConfig = $('#aba-configuracoes');

  abaConfig.addEventListener('input', (e) => {
    const r = A.rascunho;
    const t = e.target;
    if (!r || t.type === 'checkbox' || t.tagName === 'SELECT') return;
    const cargo = r.cargos[A.config.cargoSel];

    if (t.dataset.campo === 'whatsappRh') {
      t.value = mascaraTelefone(t.value);
      r.whatsappRh = t.value.replace(/\D/g, '');
    } else if (t.dataset.campo) {
      r[t.dataset.campo] = t.value;
    } else if (t.dataset.empNome !== undefined) {
      const i = Number(t.dataset.empNome);
      r.empresas[i].nome = t.value;
      $(`[data-emp-info="${i}"]`).innerHTML = infoEmpresa(r.empresas[i]);
    } else if (t.dataset.cargoCampo === 'nome') {
      cargo.nome = t.value;
      const rotulo = $(`[data-cargo-sel="${A.config.cargoSel}"] strong`);
      if (rotulo) rotulo.textContent = t.value || 'Sem nome';
    } else if (t.dataset.docCampo) {
      cargo.documentos[Number(t.dataset.doc)][t.dataset.docCampo] = t.value;
    } else if (t.id === 'c-msg') {
      r.mensagens[A.config.msg] = paraInterno(t.value);
      atualizarPreviaMsg();
    } else {
      return;
    }
    atualizarBarraSalvar();
  });

  abaConfig.addEventListener('change', (e) => {
    const r = A.rascunho;
    const t = e.target;
    if (!r) return;
    const cargo = r.cargos[A.config.cargoSel];

    if (t.dataset.empAtiva !== undefined) r.empresas[Number(t.dataset.empAtiva)].ativa = t.checked;
    else if (t.dataset.cargoCampo === 'icone') cargo.icone = t.value;
    else if (t.hasAttribute('data-cargo-ativo')) cargo.ativo = t.checked;
    else if (t.dataset.docCampo === 'icone') cargo.documentos[Number(t.dataset.doc)].icone = t.value;
    else if (t.dataset.docObrig !== undefined) cargo.documentos[Number(t.dataset.docObrig)].obrigatorio = t.checked;
    else return;
    renderConfiguracoes();
  });

  abaConfig.addEventListener('click', async (e) => {
    const r = A.rascunho;
    const b = e.target.closest('button');
    if (!r || !b || b.type === 'submit') return;
    const d = b.dataset;
    const cargo = r.cargos[A.config.cargoSel];

    if (d.configAba) {
      A.config.sub = d.configAba;
    } else if (b.hasAttribute('data-salvar')) {
      return salvarAjustes(b);
    } else if (b.hasAttribute('data-descartar')) {
      iniciarRascunho();
      U.toast('Alterações descartadas.', 'info');
    } else if (d.empRemover !== undefined) {
      r.empresas.splice(Number(d.empRemover), 1);
    } else if (d.cargoSel !== undefined) {
      A.config.cargoSel = Number(d.cargoSel);
    } else if (b.hasAttribute('data-cargo-add')) {
      r.cargos.push({ id: U.novoId('cargo'), nome: '', icone: 'briefcase', ativo: true, documentos: [] });
      A.config.cargoSel = r.cargos.length - 1;
      renderConfiguracoes();
      $('#cargo-nome').focus();
      return;
    } else if (b.hasAttribute('data-cargo-remover')) {
      const ok = await confirmar({
        titulo: `Remover o cargo ${esc(cargo.nome || 'sem nome')}?`,
        texto: 'O cargo e a lista de documentos dele serão apagados quando você salvar.',
        botao: 'Remover cargo',
        perigo: true,
      });
      if (!ok) return;
      r.cargos.splice(A.config.cargoSel, 1);
      A.config.cargoSel = 0;
    } else if (b.hasAttribute('data-doc-add')) {
      cargo.documentos.push({ id: U.novoId('doc'), nome: '', dica: '', icone: 'file', obrigatorio: true });
      renderConfiguracoes();
      const campos = $$('[data-doc-campo="nome"]');
      campos[campos.length - 1].focus();
      return;
    } else if (d.docMover !== undefined) {
      const j = Number(d.docMover);
      const k = j + Number(d.direcao);
      [cargo.documentos[j], cargo.documentos[k]] = [cargo.documentos[k], cargo.documentos[j]];
    } else if (d.docRemover !== undefined) {
      cargo.documentos.splice(Number(d.docRemover), 1);
    } else if (d.msgTipo) {
      A.config.msg = d.msgTipo;
    } else if (d.var) {
      const texto = $('#c-msg');
      const inicio = texto.selectionStart ?? texto.value.length;
      texto.setRangeText(`[${rotuloDe(d.var)}]`, inicio, texto.selectionEnd ?? inicio, 'end');
      texto.focus();
      texto.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    } else if (b.hasAttribute('data-msg-restaurar')) {
      r.mensagens[A.config.msg] = cfg.MENSAGENS[A.config.msg];
    } else {
      return;
    }
    renderConfiguracoes();
  });

  abaConfig.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'form-senha') return trocarSenha(e.target);
    if (e.target.id !== 'form-add-empresa') return;

    const campo = $('#nova-empresa');
    const nome = campo.value.trim().replace(/\s+/g, ' ');
    if (!nome) return campo.focus();
    if (A.rascunho.empresas.some((x) => normalizar(x.nome) === normalizar(nome))) {
      U.toast('Essa empresa já está na lista.', 'erro');
      return campo.focus();
    }
    A.rascunho.empresas.push({ original: '', nome, ativa: true });
    renderConfiguracoes();
    $('#nova-empresa').focus();
    U.toast(`"${nome}" adicionada. Clique em "Salvar alterações" para confirmar.`, 'info');
  });

  window.addEventListener('beforeunload', (e) => {
    if (configAlterada()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  /* ================= TOOLTIP ================= */
  const tip = $('#tooltip');

  function mostrarTip(alvo) {
    tip.innerHTML = `${alvo.dataset.tipTitulo ? `<strong>${esc(alvo.dataset.tipTitulo)}</strong>` : ''}<span>${esc(alvo.dataset.tip)}</span>`;
    tip.hidden = false;
    const r = alvo.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const x = Math.max(8, Math.min(window.innerWidth - t.width - 8, r.left + r.width / 2 - t.width / 2));
    let y = r.top - t.height - 8;
    if (y < 8) y = r.bottom + 8;
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  document.addEventListener('pointerover', (e) => {
    const alvo = e.target.closest && e.target.closest('[data-tip]');
    if (alvo) mostrarTip(alvo);
    else tip.hidden = true;
  });
  document.addEventListener('focusin', (e) => {
    const alvo = e.target.closest && e.target.closest('[data-tip]');
    if (alvo) mostrarTip(alvo);
  });
  document.addEventListener('focusout', () => { tip.hidden = true; });
  window.addEventListener('scroll', () => { tip.hidden = true; }, true);

  /* ================= EVENTOS GERAIS ================= */
  document.addEventListener('click', async (e) => {
    if (e.target.closest('#drawer, #modal-raiz')) return;

    const copiar = e.target.closest('[data-copiar]');
    if (copiar) {
      e.stopPropagation();
      await U.copiar(copiar.dataset.copiar);
      U.toast(`Código ${copiar.dataset.copiar} copiado!`, 'sucesso');
      return;
    }
    if (e.target.closest('a[href]')) return;

    const periodo = e.target.closest('[data-periodo]');
    if (periodo) {
      A.periodo = periodo.dataset.periodo;
      return renderDashboard();
    }

    const aba = e.target.closest('[data-aba]');
    if (aba) return trocarAba(aba.dataset.aba);

    if (e.target.closest('[data-novo]')) return modalCandidato();

    if (e.target.closest('[data-limpar]')) {
      A.filtro = { busca: '', status: 'todos', empresa: '', cargo: '' };
      return renderCandidatos();
    }

    const irStatus = e.target.closest('[data-ir-status]');
    if (irStatus) {
      A.filtro.status = irStatus.dataset.irStatus;
      return trocarAba('candidatos');
    }

    const abrir = e.target.closest('[data-abrir]');
    if (abrir) abrirDrawer(abrir.dataset.abrir);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('#modal-raiz').firstElementChild) fecharModal();
    else if (A.aberto) fecharDrawer();
  });

  $('#btn-atualizar').addEventListener('click', () => carregar({ silencioso: true }));

  // Atualiza sozinho a cada 1 minuto e quando a aba do navegador volta a ficar visível
  setInterval(() => {
    if (!document.hidden && A.token && !$('#modal-raiz').firstElementChild) carregar({ silencioso: true });
  }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && A.token) carregar({ silencioso: true });
  });

  /* ================= INÍCIO ================= */
  if (A.token) entrarPainel();
  else mostrarLogin();
})();
