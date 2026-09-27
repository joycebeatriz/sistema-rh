/* =========================================================================
   PORTAL DO CANDIDATO
   Fluxo: código → lista → um documento por tela → conferir foto → enviar → finalizar
   ========================================================================= */

(() => {
  const cfg = window.APP_CONFIG;
  const { icon, esc } = U;

  const app = document.getElementById('app');
  const inputCamera = document.getElementById('input-camera');
  const inputArquivo = document.getElementById('input-arquivo');
  const btnSair = document.getElementById('btn-sair');
  const btnLetra = document.getElementById('btn-letra');
  const btnContraste = document.getElementById('btn-contraste');

  const CHAVE_CODIGO = 'portalAdmissao.codigo';
  const CHAVE_PREFS = 'portalAdmissao.prefs';
  const MAX_PDF_MB = 10;

  const MSG_AJUDA = 'Olá! Preciso de ajuda com o envio dos meus documentos.';

  const estado = { c: null, idx: 0, arquivo: null, timer: null };

  /* ---------- Nome e WhatsApp do RH (definidos no painel) ---------- */
  let ajustesProntos = Promise.resolve();

  function carregarAjustes() {
    ajustesProntos = Api.chamar('publico.ajustes', {})
      .then(({ ajustes }) => {
        U.definirAjustes(ajustes);
        const a = U.ajustes();
        app.querySelectorAll('[data-rh-nome]').forEach((el) => { el.textContent = a.nomeRh; });
        app.querySelectorAll('[data-rh-whats]').forEach((el) => { el.href = U.linkWhats(a.whatsappRh, MSG_AJUDA); });
      })
      .catch(() => { /* segue com os valores iniciais */ });
  }

  /* ---------- Acessibilidade ---------- */
  function lerPrefs() {
    try { return JSON.parse(localStorage.getItem(CHAVE_PREFS)) || {}; } catch { return {}; }
  }

  function aplicarPrefs() {
    const p = lerPrefs();
    document.documentElement.classList.toggle('letra-grande', !!p.letra);
    document.documentElement.classList.toggle('alto-contraste', !!p.contraste);
    btnLetra.setAttribute('aria-pressed', String(!!p.letra));
    btnContraste.setAttribute('aria-pressed', String(!!p.contraste));
  }

  function alternarPref(chave) {
    const p = lerPrefs();
    p[chave] = !p[chave];
    localStorage.setItem(CHAVE_PREFS, JSON.stringify(p));
    aplicarPrefs();
  }

  btnLetra.addEventListener('click', () => alternarPref('letra'));
  btnContraste.addEventListener('click', () => alternarPref('contraste'));
  btnSair.addEventListener('click', sair);

  /* ---------- Utilidades de tela ---------- */
  function mostrar(html) {
    clearTimeout(estado.timer);
    pararFala();
    app.innerHTML = html;
    window.scrollTo(0, 0);
    const titulo = app.querySelector('h1');
    if (titulo) {
      titulo.tabIndex = -1;
      titulo.focus({ preventScroll: true });
    }
  }

  const docs = () => estado.c.documentos;

  function situacao(d) {
    const x = estado.c.docs[d.id];
    if (x && x.reenviar) return 'refazer';
    if (x && x.enviadoEm) return 'feito';
    if (x && x.pulado) return 'pulado';
    return 'pendente';
  }

  function proximoPendente(aPartirDe = -1) {
    const lista = docs();
    for (let k = 1; k <= lista.length; k++) {
      const i = (aPartirDe + k + lista.length) % lista.length;
      if (['pendente', 'refazer'].includes(situacao(lista[i]))) return i;
    }
    return -1;
  }

  const spinnerBotao = (texto) => `<span class="spinner" aria-hidden="true"></span> ${texto}`;

  const SVG_CHECK = '<svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  /* ---------- Tela 1: código ---------- */
  function telaCodigo(erro = '', valor = '') {
    btnSair.hidden = true;
    mostrar(`
      <section class="tela">
        <div class="hero">
          <div class="hero-icone">${icon('idCard', 44)}</div>
          <h1>Envio de documentos</h1>
          <p class="lead">Digite o código de 6 números que você recebeu da <span data-rh-nome>${esc(U.ajustes().nomeRh)}</span> pelo WhatsApp.</p>
        </div>

        <form class="cartao form-codigo" id="form-codigo" novalidate>
          <label class="rotulo" for="campo-codigo">Seu código</label>
          <input id="campo-codigo" class="campo-codigo" name="codigo" type="text"
                 inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"
                 value="${esc(valor)}" aria-describedby="erro-codigo" ${erro ? 'aria-invalid="true"' : ''}>
          <p class="msg-erro" id="erro-codigo" role="alert">${erro ? icon('alert', 20) + esc(erro) : ''}</p>
          <button class="btn btn-primario btn-grande btn-bloco" type="submit">Entrar ${icon('arrowRight')}</button>
        </form>

        <ol class="como-funciona" aria-label="Como funciona">
          <li><span class="num">${icon('key', 20)}</span>Digite o código</li>
          <li><span class="num">${icon('camera', 20)}</span>Tire as fotos</li>
          <li><span class="num">${icon('checkCircle', 20)}</span>Pronto!</li>
        </ol>

        <a class="btn-link" data-rh-whats href="${esc(U.linkWhats(U.ajustes().whatsappRh, MSG_AJUDA))}" target="_blank" rel="noopener">
          ${icon('message', 20)} Não recebeu o código? Fale com o RH
        </a>
      </section>`);
  }

  async function entrar(codigo, { silencioso = false } = {}) {
    const botao = app.querySelector('#form-codigo button[type="submit"]');
    if (botao) {
      botao.disabled = true;
      botao.innerHTML = spinnerBotao('Entrando…');
    } else {
      mostrar('<div class="tela tela-carregando"><span class="spinner" aria-hidden="true"></span><p>Carregando seus documentos…</p></div>');
    }
    try {
      const { candidato } = await Api.chamar('candidato.entrar', { codigo });
      await ajustesProntos;
      estado.c = candidato;
      localStorage.setItem(CHAVE_CODIGO, candidato.codigo);
      btnSair.hidden = false;
      if (candidato.concluidoEm) telaConcluido(false);
      else telaInicio();
    } catch (e) {
      if (e.codigo === 'CODIGO') localStorage.removeItem(CHAVE_CODIGO);
      telaCodigo(silencioso && e.codigo === 'CODIGO' ? '' : e.message, silencioso ? '' : codigo);
    }
  }

  function sair() {
    localStorage.removeItem(CHAVE_CODIGO);
    estado.c = null;
    telaCodigo();
  }

  /* ---------- Tela 2: início / lista ---------- */
  function telaInicio() {
    const c = estado.c;
    const p = U.progresso(c);
    const raio = 38;
    const circ = 2 * Math.PI * raio;
    const proximo = proximoPendente();
    const comecou = p.resolvidos > 0;
    const cargo = U.nomeCargo(c.cargo);

    let principal;
    if (proximo === -1) {
      principal = `<button class="btn btn-primario btn-grande btn-bloco" data-acao="finalizar">${icon('checkCircle')} Revisar e finalizar</button>`;
    } else {
      principal = `<button class="btn btn-primario btn-grande btn-bloco" data-acao="abrir" data-idx="${proximo}">
        ${icon(comecou ? 'arrowRight' : 'camera')} ${comecou ? 'Continuar de onde parei' : 'Começar a enviar'}</button>`;
    }

    const avisoReenvio = p.pedidosReenvio.length
      ? `<div class="aviso aviso-perigo" role="alert">${icon('alert', 22)}
           <div><strong>O RH pediu para enviar de novo:</strong>${p.pedidosReenvio.map((d) => esc(d.nome)).join(', ')}.</div>
         </div>`
      : '';

    const podeFinalizarJa = proximo !== -1 && p.obrigatoriosOk
      ? `<div class="aviso aviso-sucesso">${icon('checkCircle', 22)}
           <div><strong>Você já enviou todos os obrigatórios!</strong>Se não tiver os outros documentos, pode finalizar agora.</div>
         </div>
         <button class="btn btn-secundario btn-grande btn-bloco" data-acao="finalizar">${icon('check')} Finalizar envio</button>`
      : '';

    const itens = docs().map((d, i) => {
      const s = situacao(d);
      const sub = {
        feito: `${icon('check', 14)} Enviado`,
        pulado: 'Você não tem este documento',
        refazer: `${icon('alert', 14)} Envie uma nova foto`,
        pendente: d.obrigatorio ? 'Obrigatório' : 'Envie só se tiver',
      }[s];
      const ic = { feito: 'check', refazer: 'rotate', pulado: 'ban' }[s] || d.icone;
      return `
        <li>
          <button class="item-doc ${s}" data-acao="abrir" data-idx="${i}">
            <span class="item-doc-icone">${icon(ic, 24)}</span>
            <span class="item-doc-info">
              <span class="item-doc-nome">${esc(d.nome)}</span>
              <span class="item-doc-sub">${sub}</span>
            </span>
            ${icon('chevronRight', 22)}
          </button>
        </li>`;
    }).join('');

    mostrar(`
      <section class="tela">
        <div class="saudacao">
          <p class="ola">Olá,</p>
          <h1>${esc(U.primeiroNome(c.nome))}! 👋</h1>
          <div class="chips">
            <span class="chip">${icon('building', 16)} ${esc(c.empresa)}</span>
            <span class="chip">${icon('briefcase', 16)} ${esc(cargo)}</span>
          </div>
        </div>

        <div class="cartao cartao-progresso">
          <div class="anel" role="img" aria-label="${p.pct}% concluído">
            <svg width="88" height="88" viewBox="0 0 88 88">
              <circle class="trilho" cx="44" cy="44" r="${raio}" fill="none" stroke-width="10"/>
              <circle class="valor" cx="44" cy="44" r="${raio}" fill="none" stroke-width="10" stroke-linecap="round"
                      stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - p.pct / 100)}"/>
            </svg>
            <span class="anel-texto">${p.pct}%</span>
          </div>
          <div>
            <h2>${p.resolvidos} de ${p.total} documentos</h2>
            <p>${p.resolvidos === 0 ? 'Vamos começar? Leva uns 10 minutos.' : proximo === -1 ? 'Tudo pronto para finalizar!' : 'Ótimo, continue assim!'}</p>
          </div>
        </div>

        ${avisoReenvio}

        ${!comecou ? `
        <div class="cartao cartao-dicas">
          <h2>${icon('sun', 22)} Antes de começar</h2>
          <ul class="lista-dicas">
            <li>${icon('check', 20)} Separe seus documentos em cima da mesa</li>
            <li>${icon('check', 20)} Procure um lugar bem iluminado, perto de uma janela</li>
            <li>${icon('check', 20)} Você pode parar e continuar depois, nada se perde</li>
          </ul>
        </div>` : ''}

        ${principal}
        ${podeFinalizarJa}

        <div>
          <h2 class="titulo-secao">Seus documentos</h2>
          <p class="muted">Se preferir, toque em qualquer documento para enviar na ordem que quiser.</p>
        </div>
        <ul class="lista-docs">${itens}</ul>
      </section>`);
  }

  /* ---------- Tela 3: um documento ---------- */
  function telaDoc(idx) {
    estado.idx = idx;
    estado.arquivo = null;
    const lista = docs();
    const d = lista[idx];
    const s = situacao(d);
    const info = estado.c.docs[d.id];
    const p = U.progresso(estado.c);

    const avisos = {
      feito: `<div class="aviso aviso-sucesso">${icon('checkCircle', 22)}<div><strong>Você já enviou este documento.</strong>Enviado em ${U.fmtDataHora(info && info.enviadoEm)}. Se quiser, pode mandar outra foto no lugar.</div></div>`,
      refazer: `<div class="aviso aviso-perigo" role="alert">${icon('alert', 22)}<div><strong>O RH pediu uma nova foto.</strong>A anterior não ficou legível. Tire outra com bastante luz.</div></div>`,
      pulado: `<div class="aviso aviso-info">${icon('help', 22)}<div><strong>Você marcou que não tem este documento.</strong>Se encontrar, pode enviar agora.</div></div>`,
    };

    mostrar(`
      <section class="tela">
        <div class="topo-passo">
          <button class="btn-voltar" data-acao="inicio">${icon('arrowLeft', 22)} Lista</button>
          <span class="contador">Documento ${idx + 1} de ${lista.length}</span>
        </div>
        <div class="barra" role="progressbar" aria-label="Progresso do envio" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}">
          <span style="width:${p.pct}%"></span>
        </div>

        <div class="doc-cabecalho">
          <div class="doc-icone-grande">${icon(d.icone, 48)}</div>
          ${d.obrigatorio ? '' : '<span class="badge badge-neutro">Envie só se tiver</span>'}
          <h1>${esc(d.nome)}</h1>
          <p class="lead">${esc(d.dica)}</p>
          ${'speechSynthesis' in window ? `<button class="btn-ouvir" data-acao="ouvir">${icon('volume', 20)} Ouvir explicação</button>` : ''}
        </div>

        ${avisos[s] || ''}

        <div class="acoes-envio">
          <button class="btn btn-primario btn-grande btn-bloco" data-acao="camera">
            ${icon('camera')} ${s === 'feito' ? 'Tirar outra foto' : 'Tirar foto agora'}
          </button>
          <button class="btn btn-secundario btn-grande btn-bloco" data-acao="arquivo">
            ${icon('image')} Escolher da galeria ou PDF
          </button>
        </div>

        <details class="dicas-foto">
          <summary>${icon('sun', 22)} Como tirar uma boa foto ${icon('chevronRight', 20)}</summary>
          <div class="exemplos">
            <div class="exemplo exemplo-bom">
              <div class="exemplo-img"><div class="exemplo-doc"></div><span class="exemplo-selo">${icon('check', 16)}</span></div>
              Reto, inteiro e com luz
            </div>
            <div class="exemplo exemplo-ruim">
              <div class="exemplo-img"><div class="exemplo-doc"></div><span class="exemplo-selo">${icon('x', 16)}</span></div>
              Escuro, torto ou cortado
            </div>
          </div>
          <ul class="lista-dicas" style="padding: 0 1rem 1rem">
            <li>${icon('check', 20)} Coloque o documento sobre uma mesa</li>
            <li>${icon('check', 20)} Deixe o documento inteiro aparecendo na tela</li>
            <li>${icon('check', 20)} Evite o flash e o reflexo do plástico</li>
            <li>${icon('check', 20)} Segure o celular firme até a foto sair</li>
          </ul>
        </details>

        <div class="rodape-passo">
          ${!d.obrigatorio && s !== 'pulado' ? `<button class="btn-link" data-acao="pular">${icon('ban', 20)} Não tenho este documento</button>` : ''}
          ${s === 'feito' || s === 'pulado' ? `<button class="btn btn-fantasma" data-acao="proximo">Ir para o próximo ${icon('arrowRight')}</button>` : ''}
        </div>
      </section>`);
  }

  function abrirSeletor(input) {
    input.value = '';
    input.click();
  }

  async function prepararArquivo(file) {
    telaProcessando('Preparando a foto…', 'Só um instante.', 'image');
    try {
      const ehPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      if (ehPdf) {
        if (file.size > MAX_PDF_MB * 1024 * 1024) {
          throw new Error(`Esse PDF é muito grande (máximo ${MAX_PDF_MB} MB). Tente tirar uma foto do documento.`);
        }
        estado.arquivo = { pdf: true, tipo: 'application/pdf', nome: file.name, tamanho: file.size, base64: await U.lerComoBase64(file) };
      } else if (!file.type || file.type.startsWith('image/')) {
        estado.arquivo = await U.processarImagem(file, { comPrevia: false });
      } else {
        throw new Error('Esse tipo de arquivo não é aceito. Envie uma foto ou um PDF.');
      }
      telaRevisar();
    } catch (e) {
      telaDoc(estado.idx);
      U.toast(e.message, 'erro');
    }
  }

  /* ---------- Tela 4: conferir ---------- */
  function telaRevisar() {
    const d = docs()[estado.idx];
    const a = estado.arquivo;
    const idx = estado.idx;

    let avisoQualidade = '';
    if (a.qualidade) {
      const problemas = [];
      if (a.qualidade.escura) problemas.push('está escura');
      if (a.qualidade.clara) problemas.push('está muito clara ou com reflexo');
      if (a.qualidade.borrada) problemas.push('pode estar tremida');
      avisoQualidade = problemas.length
        ? `<div class="aviso aviso-alerta" role="alert">${icon('alert', 22)}<div><strong>Atenção: a foto ${problemas.join(' e ')}.</strong>Se não der para ler bem, tire outra.</div></div>`
        : `<div class="aviso aviso-sucesso">${icon('checkCircle', 22)}<div><strong>A foto parece boa!</strong>Confira se dá para ler tudo.</div></div>`;
    }

    const previa = a.pdf
      ? `<figure class="previa previa-pdf">${icon('file', 56)}<span>${esc(a.nome)}</span><small>${(a.tamanho / 1024 / 1024).toFixed(1)} MB</small></figure>`
      : `<figure class="previa"><img src="${a.dataUrl}" alt="Foto enviada: ${esc(d.nome)}"></figure>`;

    mostrar(`
      <section class="tela">
        <div class="topo-passo">
          <button class="btn-voltar" data-acao="abrir" data-idx="${idx}">${icon('arrowLeft', 22)} Voltar</button>
          <span class="contador">${esc(d.nome)}</span>
        </div>
        <h1>${a.pdf ? 'Confira o arquivo' : 'Confira a foto'}</h1>
        ${previa}
        ${avisoQualidade}
        <p class="pergunta">${a.pdf ? 'É este o arquivo certo?' : 'Dá para ler todas as letras e números?'}</p>
        <div class="acoes-envio">
          <button class="btn btn-primario btn-grande btn-bloco" data-acao="enviar">${icon('check')} Sim, enviar</button>
          <button class="btn btn-secundario btn-grande btn-bloco" data-acao="${a.pdf ? 'arquivo' : 'refazer'}">
            ${icon('rotate')} ${a.pdf ? 'Escolher outro arquivo' : 'Não, tirar outra foto'}
          </button>
        </div>
      </section>`);
  }

  /* ---------- Envio ---------- */
  function telaProcessando(titulo, texto, ic = 'upload') {
    mostrar(`
      <section class="tela tela-status" role="status">
        <div class="circulo-status"><span class="spinner" aria-hidden="true"></span>${icon(ic, 44)}</div>
        <h1>${titulo}</h1>
        <p class="lead">${texto}</p>
        <div class="barra barra-indeterminada" aria-hidden="true"><span></span></div>
      </section>`);
  }

  async function enviar() {
    const d = docs()[estado.idx];
    const a = estado.arquivo;
    if (!a) return telaDoc(estado.idx);

    telaProcessando('Enviando…', 'Não feche esta tela. Pode levar alguns segundos.');
    try {
      const { candidato } = await Api.chamar('candidato.enviar', {
        codigo: estado.c.codigo,
        docId: d.id,
        arquivo: { tipo: a.tipo, base64: a.base64, previa: a.previa },
      });
      estado.c = candidato;
      estado.arquivo = null;
      telaEnviado(d);
    } catch (e) {
      telaErroEnvio(e);
    }
  }

  function telaEnviado(d) {
    const proximo = proximoPendente(estado.idx);
    mostrar(`
      <section class="tela tela-status" role="status">
        <div class="check-animado">${SVG_CHECK}</div>
        <h1>Enviado!</h1>
        <p class="lead"><strong>${esc(d.nome)}</strong> recebido com sucesso.</p>
        ${proximo !== -1 ? '<p class="muted">Indo para o próximo documento…</p>' : ''}
        <button class="btn btn-primario btn-grande" data-acao="proximo">
          ${proximo === -1 ? 'Continuar' : 'Próximo documento'} ${icon('arrowRight')}
        </button>
      </section>`);
    estado.timer = setTimeout(irParaProximo, 2400);
  }

  function telaErroEnvio(erro) {
    mostrar(`
      <section class="tela tela-status">
        <div class="icone-erro">${icon('alert', 52)}</div>
        <h1>Não foi possível enviar</h1>
        <p class="lead">${esc(erro.message)}</p>
        <div class="acoes-envio" style="width:100%">
          <button class="btn btn-primario btn-grande btn-bloco" data-acao="enviar">${icon('refresh')} Tentar de novo</button>
          <button class="btn btn-secundario btn-grande btn-bloco" data-acao="abrir" data-idx="${estado.idx}">Voltar</button>
        </div>
      </section>`);
  }

  function irParaProximo() {
    const i = proximoPendente(estado.idx);
    if (i === -1) telaFinal();
    else telaDoc(i);
  }

  async function pular(botao) {
    const d = docs()[estado.idx];
    botao.disabled = true;
    botao.innerHTML = spinnerBotao('Salvando…');
    try {
      const { candidato } = await Api.chamar('candidato.pular', { codigo: estado.c.codigo, docId: d.id });
      estado.c = candidato;
      irParaProximo();
    } catch (e) {
      U.toast(e.message, 'erro');
      telaDoc(estado.idx);
    }
  }

  /* ---------- Tela 5: revisão final ---------- */
  function telaFinal() {
    const p = U.progresso(estado.c);
    const linhas = docs().map((d) => {
      const s = situacao(d);
      let [classe, ic, texto] = ['nao', 'ban', 'Não enviado'];
      if (s === 'feito') [classe, ic, texto] = ['ok', 'checkCircle', 'Enviado'];
      else if (s === 'pulado') [classe, ic, texto] = ['nao', 'ban', 'Não possui'];
      else if (d.obrigatorio || s === 'refazer') [classe, ic, texto] = ['falta', 'alert', 'Falta'];
      return `<li><span class="${classe}">${icon(ic, 22)}</span>${esc(d.nome)}<small>${texto}</small></li>`;
    }).join('');

    const primeiroFaltando = p.pendentesObrigatorios[0];
    const acao = p.obrigatoriosOk
      ? `<button class="btn btn-primario btn-grande btn-bloco" data-acao="concluir">${icon('check')} Finalizar e enviar para o RH</button>`
      : `<div class="aviso aviso-alerta">${icon('alert', 22)}<div><strong>Ainda faltam documentos obrigatórios.</strong>Envie os itens marcados como "Falta" para finalizar.</div></div>
         <button class="btn btn-primario btn-grande btn-bloco" data-acao="abrir" data-idx="${docs().indexOf(primeiroFaltando)}">${icon('camera')} Enviar o que falta</button>`;

    mostrar(`
      <section class="tela">
        <div class="topo-passo">
          <button class="btn-voltar" data-acao="inicio">${icon('arrowLeft', 22)} Lista</button>
        </div>
        <div class="hero">
          <div class="hero-icone">${icon('shieldCheck', 44)}</div>
          <h1>Quase lá!</h1>
          <p class="lead">Confira a lista. Se estiver tudo certo, toque em <strong>Finalizar</strong>.</p>
        </div>
        <div class="cartao resumo"><ul>${linhas}</ul></div>
        ${acao}
        <button class="btn-link" data-acao="inicio">Quero mudar alguma coisa</button>
      </section>`);
  }

  async function concluir(botao) {
    const original = botao.innerHTML;
    botao.disabled = true;
    botao.innerHTML = spinnerBotao('Finalizando…');
    try {
      const { candidato } = await Api.chamar('candidato.concluir', { codigo: estado.c.codigo });
      estado.c = candidato;
      telaConcluido(true);
    } catch (e) {
      U.toast(e.message, 'erro');
      botao.disabled = false;
      botao.innerHTML = original;
    }
  }

  /* ---------- Tela 6: concluído ---------- */
  function telaConcluido(comFesta) {
    const c = estado.c;
    const rh = U.ajustes();
    const whats = U.linkWhats(rh.whatsappRh, `Olá, ${rh.nomeRh}! Sou ${c.nome} e já enviei meus documentos pelo portal.`);
    mostrar(`
      <section class="tela tela-concluido">
        <div class="check-animado">${SVG_CHECK}</div>
        <h1>Tudo certo, ${esc(U.primeiroNome(c.nome))}!</h1>
        <p class="lead">Recebemos os seus documentos. Obrigado!</p>

        <div class="cartao proximos">
          <h2>O que acontece agora?</h2>
          <ol>
            <li><span class="num">1</span><span>A ${esc(rh.nomeRh)} vai <strong>conferir seus documentos</strong>.</span></li>
            <li><span class="num">2</span><span>Se alguma foto não ficar boa, ela <strong>avisa pelo WhatsApp</strong>.</span></li>
            <li><span class="num">3</span><span>Depois você recebe as informações sobre a <strong>integração</strong>.</span></li>
          </ol>
        </div>

        <a class="btn btn-whats btn-grande btn-bloco" href="${esc(whats)}" target="_blank" rel="noopener">${icon('message')} Falar com o RH no WhatsApp</a>
        <p class="muted">Pode fechar esta página.</p>
      </section>`);
    if (comFesta) confete();
  }

  function confete() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cores = ['#129077', '#f59e0b', '#7fcfb9', '#1d5bbf', '#ec835a', '#16a34a'];
    const box = document.createElement('div');
    box.className = 'confete';
    box.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 70; i++) {
      const p = document.createElement('i');
      p.style.left = `${Math.random() * 100}%`;
      p.style.background = cores[i % cores.length];
      p.style.animationDuration = `${2.4 + Math.random() * 2}s`;
      p.style.animationDelay = `${Math.random() * 0.6}s`;
      p.style.transform = `rotate(${Math.random() * 360}deg)`;
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 5200);
  }

  /* ---------- Leitura em voz alta ---------- */
  function falar(botao) {
    if (speechSynthesis.speaking) {
      pararFala();
      botao.classList.remove('falando');
      return;
    }
    const d = docs()[estado.idx];
    const texto = `${d.nome}. ${d.dica} ${d.obrigatorio ? '' : 'Envie só se você tiver este documento.'} Para enviar, toque no botão verde: tirar foto agora.`;
    const fala = new SpeechSynthesisUtterance(texto);
    fala.lang = 'pt-BR';
    fala.rate = 0.92;
    const vozes = speechSynthesis.getVoices();
    const voz = vozes.find((v) => /pt[-_]BR/i.test(v.lang)) || vozes.find((v) => /^pt/i.test(v.lang));
    if (voz) fala.voice = voz;
    fala.onend = fala.onerror = () => botao.classList.remove('falando');
    botao.classList.add('falando');
    speechSynthesis.speak(fala);
  }

  function pararFala() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  /* ---------- Eventos ---------- */
  const acoes = {
    inicio: () => telaInicio(),
    abrir: (el) => telaDoc(Number(el.dataset.idx)),
    camera: () => abrirSeletor(inputCamera),
    arquivo: () => abrirSeletor(inputArquivo),
    refazer: () => { telaDoc(estado.idx); abrirSeletor(inputCamera); },
    ouvir: (el) => falar(el),
    pular: (el) => pular(el),
    proximo: () => irParaProximo(),
    enviar: () => enviar(),
    finalizar: () => telaFinal(),
    concluir: (el) => concluir(el),
  };

  app.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-acao]');
    if (alvo && acoes[alvo.dataset.acao]) acoes[alvo.dataset.acao](alvo, e);
  });

  app.addEventListener('submit', (e) => {
    if (e.target.id !== 'form-codigo') return;
    e.preventDefault();
    const campo = e.target.querySelector('#campo-codigo');
    const codigo = campo.value.replace(/\D/g, '');
    if (codigo.length !== 6) {
      telaCodigo('O código tem 6 números. Confira e tente de novo.', codigo);
      app.querySelector('#campo-codigo').focus();
      return;
    }
    entrar(codigo);
  });

  app.addEventListener('input', (e) => {
    if (e.target.id !== 'campo-codigo') return;
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    e.target.removeAttribute('aria-invalid');
  });

  [inputCamera, inputArquivo].forEach((input) => {
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (file) prepararArquivo(file);
    });
  });

  /* ---------- Início ---------- */
  async function iniciar() {
    aplicarPrefs();
    carregarAjustes();

    const params = new URLSearchParams(window.location.search);
    const doLink = (params.get('codigo') || '').replace(/\D/g, '');
    const salvo = localStorage.getItem(CHAVE_CODIGO);

    if (doLink) {
      // Tira o código da barra de endereço (evita aparecer em prints)
      history.replaceState(null, '', window.location.pathname);
      await entrar(doLink);
    } else if (salvo) {
      await entrar(salvo, { silencioso: true });
    } else {
      telaCodigo();
    }
  }

  iniciar();
})();
