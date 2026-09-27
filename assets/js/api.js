/* =========================================================================
   Comunicação com o servidor (Power Automate + Office Script no Excel).
   É obrigatório configurar API_URL no config.js (URL do fluxo do Power Automate).
   ========================================================================= */

const Api = (() => {
  const cfg = window.APP_CONFIG;

  function falha(mensagem, codigo) {
    const e = new Error(mensagem);
    e.codigo = codigo;
    return e;
  }

  async function remoto(acao, dados) {
    if (!cfg.API_URL) {
      throw falha('Sistema não configurado: falta o endereço da API (API_URL) em config.js.', 'CONFIG');
    }
    // O arquivo vai separado: o Power Automate salva no SharePoint e o script só recebe o tipo e o tamanho
    let arquivo = '';
    if (dados && dados.arquivo) {
      arquivo = dados.arquivo.base64 || '';
      dados = { ...dados, arquivo: { tipo: dados.arquivo.tipo, tamanho: Math.floor((arquivo.length * 3) / 4) } };
    }
    let resposta;
    try {
      // Formulário simples evita o bloqueio de CORS (o navegador não faz a checagem prévia)
      resposta = await fetch(cfg.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
        body: new URLSearchParams({ pedido: JSON.stringify({ acao, dados, arquivo }) }),
      });
    } catch {
      throw falha('Sem conexão com a internet. Verifique e tente de novo.', 'REDE');
    }
    let json;
    try {
      json = await resposta.json();
    } catch {
      throw falha('O servidor não respondeu corretamente. Tente de novo em instantes.', 'SERVIDOR');
    }
    if (!json.ok) throw falha(json.erro || 'Algo deu errado.', json.codigo);
    return json.dados;
  }

  return {
    chamar: (acao, dados) => remoto(acao, dados),
  };
})();
