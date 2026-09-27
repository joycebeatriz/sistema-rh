/* =========================================================================
   Funções compartilhadas entre o portal do candidato e o painel
   ========================================================================= */

const U = (() => {
  const cfg = window.APP_CONFIG;

  /* ---------- Ícones (traços no estilo Lucide) ---------- */
  const ICONES = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    arrowUp: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    hourglass: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    rotate: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    shieldCheck: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    briefcase: '<rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    building: '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',
    volume: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    idCard: '<path d="M16 10h2"/><path d="M16 14h2"/><path d="M6.17 15a3 3 0 0 1 5.66 0"/><circle cx="9" cy="11" r="2"/><rect x="2" y="5" width="20" height="14" rx="2"/>',
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    graduation: '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    bank: '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    bus: '<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    contrast: '<circle cx="12" cy="12" r="10"/><path d="M12 18a6 6 0 0 0 0-12v12z"/>',
    type: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>',
    key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    smartphone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
    trending: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
  };

  function icon(nome, tamanho = 20, extra = '') {
    return `<svg class="icone ${extra}" width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome] || ICONES.file}</svg>`;
  }

  /* ---------- Texto e datas ---------- */
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || '';

  function iniciais(nome) {
    const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    return ((p[0][0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }

  const pad = (n) => String(n).padStart(2, '0');

  function fmtData(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  function fmtDataHora(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${fmtData(iso)} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function tempoRelativo(iso) {
    if (!iso) return '—';
    const seg = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (seg < 60) return 'agora mesmo';
    const min = Math.round(seg / 60);
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24);
    if (d === 1) return 'ontem';
    if (d < 30) return `há ${d} dias`;
    return fmtData(iso);
  }

  function fmtTelefone(tel) {
    const n = String(tel || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
    if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
    return tel || '';
  }

  /* ---------- WhatsApp ---------- */
  function linkWhats(tel, mensagem = '') {
    let n = String(tel || '').replace(/\D/g, '');
    if (n.length === 10 || n.length === 11) n = '55' + n;
    const txt = mensagem ? `?text=${encodeURIComponent(mensagem)}` : '';
    return `https://wa.me/${n}${txt}`;
  }

  function linkPortal(codigo) {
    const url = new URL('index.html', window.location.href);
    if (codigo) url.searchParams.set('codigo', codigo);
    return url.href;
  }

  /* ---------- Ajustes (editados no painel, em Configurações) ---------- */
  let ajustesServidor = null;

  function definirAjustes(a) {
    ajustesServidor = a || null;
  }

  // Junta o que foi salvo no painel com os valores iniciais do config.js
  function ajustes() {
    const s = ajustesServidor || {};
    const m = s.mensagens || {};
    return {
      nomeRh: s.nomeRh || cfg.NOME_RH,
      whatsappRh: s.whatsappRh || cfg.WHATSAPP_RH,
      emailRecuperacao: s.emailRecuperacao || '',
      empresas: Array.isArray(s.empresas) && s.empresas.length
        ? s.empresas.map((e) => ({ nome: e.nome, ativa: e.ativa !== false }))
        : cfg.EMPRESAS.map((nome) => ({ nome, ativa: true })),
      cargos: Array.isArray(s.cargos) && s.cargos.length
        ? s.cargos.map((c) => ({ id: c.id, nome: c.nome, icone: c.icone || 'briefcase', ativo: c.ativo !== false, documentos: c.documentos || [] }))
        : Object.entries(cfg.CARGOS).map(([id, c]) => ({ id, nome: c.nome, icone: c.icone, ativo: true, documentos: c.documentos })),
      mensagens: {
        convite: m.convite || cfg.MENSAGENS.convite,
        cobranca: m.cobranca || cfg.MENSAGENS.cobranca,
        novaFoto: m.novaFoto || cfg.MENSAGENS.novaFoto,
      },
    };
  }

  const cargo = (id) => ajustes().cargos.find((c) => c.id === id) || null;
  const nomeCargo = (id) => (cargo(id) && cargo(id).nome) || (id ? id.charAt(0).toUpperCase() + id.slice(1) : '—');
  const novoId = (prefixo) => `${prefixo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  // rotulo = como aparece para quem edita a mensagem, ex.: [Primeiro nome]
  const VARIAVEIS = [
    { chave: 'primeiro_nome', rotulo: 'Primeiro nome', exemplo: 'João' },
    { chave: 'nome', rotulo: 'Nome completo', exemplo: 'João Batista da Silva' },
    { chave: 'link', rotulo: 'Link do portal', exemplo: 'link para entrar' },
    { chave: 'codigo', rotulo: 'Código', exemplo: '482915' },
    { chave: 'empresa', rotulo: 'Empresa', exemplo: 'Rápido Araguaia' },
    { chave: 'cargo', rotulo: 'Cargo', exemplo: 'Motorista' },
    { chave: 'rh', rotulo: 'Nome do RH', exemplo: 'Mariana' },
    { chave: 'pendentes', rotulo: 'Documentos que faltam', exemplo: 'lista do que falta', so: 'cobranca' },
    { chave: 'documento', rotulo: 'Documento da foto', exemplo: 'RG – frente', so: 'novaFoto' },
  ];

  // Troca {variavel} pelos dados do candidato. Variáveis desconhecidas ficam como estão.
  function mensagem(tipo, c, { modelo, rh, documento } = {}) {
    const a = ajustes();
    const vars = {
      nome: c.nome,
      primeiro_nome: primeiroNome(c.nome),
      codigo: c.codigo,
      link: linkPortal(c.codigo),
      empresa: c.empresa,
      cargo: nomeCargo(c.cargo),
      rh: rh ?? a.nomeRh,
      pendentes: progresso(c).pendentesObrigatorios.map((d) => `• ${d.nome}`).join('\n') || '• Finalizar o envio no portal',
      documento: documento || '',
    };
    return String(modelo ?? a.mensagens[tipo]).replace(/\{(\w+)\}/g, (trecho, chave) => (chave in vars ? String(vars[chave] ?? '') : trecho));
  }

  const mensagemConvite = (c) => mensagem('convite', c);
  const mensagemCobranca = (c) => mensagem('cobranca', c);
  const mensagemNovaFoto = (c, nomeDocumento) => mensagem('novaFoto', c, { documento: nomeDocumento });

  /* ---------- Regras de status e progresso ---------- */
  const docEnviado = (d) => !!(d && d.enviadoEm && !d.reenviar);
  const docResolvido = (d) => !!(d && !d.reenviar && (d.enviadoEm || d.pulado));

  function progresso(c) {
    const docs = c.docs || {};
    const lista = c.documentos || [];
    const obrig = lista.filter((d) => d.obrigatorio);
    const resolvidos = lista.filter((d) => docResolvido(docs[d.id]));
    const pendentesObrigatorios = obrig.filter((d) => !docEnviado(docs[d.id]));
    return {
      total: lista.length,
      resolvidos: resolvidos.length,
      enviados: lista.filter((d) => docEnviado(docs[d.id])).length,
      obrigatorios: obrig.length,
      pendentesObrigatorios,
      obrigatoriosOk: pendentesObrigatorios.length === 0,
      pedidosReenvio: lista.filter((d) => docs[d.id] && docs[d.id].reenviar),
      pct: lista.length ? Math.round((resolvidos.length / lista.length) * 100) : 0,
    };
  }

  function status(c) {
    if (c.concluidoEm) return 'concluido';
    const docs = c.docs || {};
    return Object.values(docs).some((d) => d.enviadoEm || d.pulado || d.reenviar) ? 'andamento' : 'aguardando';
  }

  const STATUS = {
    aguardando: { rotulo: 'Aguardando', icone: 'hourglass', classe: 'neutro' },
    andamento: { rotulo: 'Em andamento', icone: 'clock', classe: 'alerta' },
    concluido: { rotulo: 'Concluído', icone: 'checkCircle', classe: 'sucesso' },
  };

  function badgeStatus(c) {
    const s = STATUS[status(c)];
    return `<span class="badge badge-${s.classe}">${icon(s.icone, 14)}${s.rotulo}</span>`;
  }

  /* ---------- Imagens ---------- */
  function carregarImagem(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Não conseguimos abrir essa imagem. Tente tirar a foto de novo.'));
      };
      img.src = url;
    });
  }

  function desenhar(img, max) {
    const escala = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { canvas, ctx };
  }

  // Estimativa simples de brilho e nitidez (variância do Laplaciano).
  // Serve só para AVISAR — nunca bloqueia o envio.
  function analisarQualidade(img) {
    const { canvas, ctx } = desenhar(img, 480);
    const { width: w, height: h } = canvas;
    const px = ctx.getImageData(0, 0, w, h).data;
    const cinza = new Float32Array(w * h);
    let soma = 0;
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      cinza[j] = g;
      soma += g;
    }
    const brilho = soma / cinza.length;
    let n = 0, media = 0, quad = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const lap = 4 * cinza[i] - cinza[i - 1] - cinza[i + 1] - cinza[i - w] - cinza[i + w];
        media += lap;
        quad += lap * lap;
        n++;
      }
    }
    media /= n || 1;
    const nitidez = quad / (n || 1) - media * media;
    return {
      brilho: Math.round(brilho),
      nitidez: Math.round(nitidez),
      escura: brilho < 65,
      clara: brilho > 235,
      borrada: nitidez < 80,
    };
  }

  async function processarImagem(file, { max = 1800, qualidade = 0.85, comPrevia = false } = {}) {
    const { img, url } = await carregarImagem(file);
    try {
      const { canvas } = desenhar(img, max);
      const dataUrl = canvas.toDataURL('image/jpeg', qualidade);
      const resultado = {
        tipo: 'image/jpeg',
        dataUrl,
        base64: dataUrl.split(',')[1],
        qualidade: analisarQualidade(img),
      };
      if (comPrevia) resultado.previa = desenhar(img, 520).canvas.toDataURL('image/jpeg', 0.6);
      return resultado;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function lerComoBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(new Error('Não conseguimos ler esse arquivo.'));
      r.readAsDataURL(file);
    });
  }

  /* ---------- Interface ---------- */
  function toast(mensagem, tipo = 'info') {
    let box = document.getElementById('toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toasts';
      box.className = 'toasts';
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    const icones = { sucesso: 'checkCircle', erro: 'alert', info: 'help' };
    const el = document.createElement('div');
    el.className = `toast toast-${tipo}`;
    el.innerHTML = `${icon(icones[tipo] || 'help', 20)}<span>${esc(mensagem)}</span>`;
    box.appendChild(el);
    setTimeout(() => {
      el.classList.add('saindo');
      setTimeout(() => el.remove(), 300);
    }, 3600);
  }

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const t = document.createElement('textarea');
      t.value = texto;
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
  }

  const espera = (ms) => new Promise((r) => setTimeout(r, ms));

  return {
    icon, esc, primeiroNome, iniciais, fmtData, fmtDataHora, tempoRelativo, fmtTelefone,
    linkWhats, linkPortal, mensagem, mensagemConvite, mensagemCobranca, mensagemNovaFoto,
    definirAjustes, ajustes, cargo, nomeCargo, novoId, VARIAVEIS,
    docEnviado, docResolvido, progresso, status, STATUS, badgeStatus,
    processarImagem, lerComoBase64, toast, copiar, espera,
  };
})();
