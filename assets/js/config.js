/* =========================================================================
   CONFIGURAÇÃO DO PORTAL
   Este é o único arquivo que precisa ser editado no dia a dia.
   ========================================================================= */

window.APP_CONFIG = {
  // Link do fluxo do Power Automate (URL HTTP POST do gatilho, veja o README).
  // Deixe vazio ('') para usar o MODO DEMONSTRAÇÃO (dados ficam só no navegador).
  API_URL: '',

  NOME_PORTAL: 'Portal de Admissão',

  /* -----------------------------------------------------------------------
     VALORES INICIAIS
     Nome do RH, WhatsApp, empresas e mensagens são editados pelo painel,
     em Configurações. Os valores abaixo só valem até a primeira vez que
     alguém salvar por lá.
     ----------------------------------------------------------------------- */
  NOME_RH: 'Mariana',
  // WhatsApp do RH com DDI + DDD, só números. Usado no botão "Falar com o RH".
  WHATSAPP_RH: '5562985230289',

  EMPRESAS: [
    'Rápido Araguaia',
    'Viação Araguarina',
    'Shopping do Cerrado',
    'Osac – Odilon Santos',
  ],

  // Variáveis: {primeiro_nome} {nome} {codigo} {link} {empresa} {cargo} {rh}
  // Só na cobrança: {pendentes}  ·  Só no pedido de nova foto: {documento}
  MENSAGENS: {
    convite: [
      'Olá, {primeiro_nome}! Tudo bem? 😊',
      '',
      'Aqui é a {rh}, do RH. Para darmos celeridade no seu processo seletivo, vamos para a etapa da documentação.',
      '',
      '📲 É só tocar no link abaixo:',
      '{link}',
      '',
      '🔑 Se pedir, seu código é: *{codigo}*',
      '',
      'Tire foto de cada documento com a imagem nítida, para facilitar a conferência. Qualquer dúvida, é só me chamar aqui!',
    ].join('\n'),

    cobranca: [
      'Olá, {primeiro_nome}! Aqui é a {rh}, do RH. 😊',
      '',
      'Para concluir sua etapa de documentação, ainda faltam:',
      '{pendentes}',
      '',
      '📲 É só tocar no link:',
      '{link}',
      '',
      '🔑 Código: *{codigo}*',
    ].join('\n'),

    novaFoto: [
      'Olá, {primeiro_nome}! Aqui é a {rh}, do RH. 😊',
      '',
      'A foto do documento *{documento}* não ficou legível. Pode enviar de novo, por favor?',
      '',
      'Dica: coloque o documento sobre uma mesa, perto de uma janela, e confira se dá para ler tudo antes de enviar.',
      '',
      '📲 É só tocar no link:',
      '{link}',
    ].join('\n'),
  },

  // Documentos pedidos para cada cargo.
  // obrigatorio: false → aparece o botão "Não tenho este documento".
  CARGOS: {
    motorista: {
      nome: 'Motorista',
      icone: 'bus',
      documentos: [
        { id: 'cnh_frente', nome: 'CNH – frente', icone: 'idCard', obrigatorio: true,
          dica: 'Tire a CNH do plástico, coloque sobre uma mesa e fotografe o lado que tem a sua foto.' },
        { id: 'cnh_verso', nome: 'CNH – verso', icone: 'idCard', obrigatorio: true,
          dica: 'Agora vire a CNH e fotografe o outro lado. Se usa a CNH Digital, pode enviar o PDF ou um print do aplicativo.' },
        { id: 'residencia', nome: 'Comprovante de residência', icone: 'home', obrigatorio: true,
          dica: 'Conta de água, luz, internet ou telefone dos últimos 3 meses, com o endereço aparecendo.' },
        { id: 'ctps', nome: 'Carteira de Trabalho Digital', icone: 'briefcase', obrigatorio: true,
          dica: 'Abra o aplicativo Carteira de Trabalho Digital e tire um print da tela com os seus dados.' },
        { id: 'titulo', nome: 'Título de eleitor', icone: 'file', obrigatorio: true,
          dica: 'Pode ser o documento em papel ou um print do aplicativo e-Título.' },
        { id: 'certidao', nome: 'Certidão de nascimento ou casamento', icone: 'file', obrigatorio: true,
          dica: 'Se for casado(a), envie a certidão de casamento. Se não, a de nascimento.' },
        { id: 'escolaridade', nome: 'Comprovante de escolaridade', icone: 'graduation', obrigatorio: true,
          dica: 'Diploma, certificado ou declaração da escola.' },
        { id: 'antecedentes', nome: 'Certidão de antecedentes criminais', icone: 'shieldCheck', obrigatorio: true,
          dica: 'É gratuita e pode ser tirada pela internet, no site da Polícia Federal ou da Polícia Civil do seu estado.' },
        { id: 'banco', nome: 'Dados bancários', icone: 'bank', obrigatorio: true,
          dica: 'Foto do cartão do banco ou print do aplicativo mostrando agência e número da conta.' },
        { id: 'foto', nome: 'Sua foto (tipo 3x4)', icone: 'user', obrigatorio: true,
          dica: 'Fique na frente de uma parede clara, sem boné e sem óculos escuros. Se puder, peça para alguém tirar.' },
        { id: 'reservista', nome: 'Certificado de reservista', icone: 'award', obrigatorio: false,
          dica: 'Somente para homens com até 45 anos.' },
        { id: 'toxicologico', nome: 'Exame toxicológico', icone: 'file', obrigatorio: false,
          dica: 'Se você já tem um exame toxicológico válido, envie aqui.' },
        { id: 'cursos', nome: 'Cursos de motorista', icone: 'award', obrigatorio: false,
          dica: 'Ex.: transporte coletivo de passageiros, MOPP, direção defensiva.' },
        { id: 'filhos', nome: 'Certidão de nascimento dos filhos', icone: 'heart', obrigatorio: false,
          dica: 'Apenas dos filhos menores de 14 anos. Se tiver mais de um, envie um PDF ou junte na mesma foto.' },
      ],
    },

    administrativo: {
      nome: 'Administrativo',
      icone: 'briefcase',
      documentos: [
        { id: 'rg_frente', nome: 'RG – frente', icone: 'idCard', obrigatorio: true,
          dica: 'Tire o RG do plástico, coloque sobre uma mesa e fotografe o lado que tem a sua foto.' },
        { id: 'rg_verso', nome: 'RG – verso', icone: 'idCard', obrigatorio: true,
          dica: 'Agora vire o RG e fotografe o outro lado.' },
        { id: 'residencia', nome: 'Comprovante de residência', icone: 'home', obrigatorio: true,
          dica: 'Conta de água, luz, internet ou telefone dos últimos 3 meses, com o endereço aparecendo.' },
        { id: 'ctps', nome: 'Carteira de Trabalho Digital', icone: 'briefcase', obrigatorio: true,
          dica: 'Abra o aplicativo Carteira de Trabalho Digital e tire um print da tela com os seus dados.' },
        { id: 'titulo', nome: 'Título de eleitor', icone: 'file', obrigatorio: true,
          dica: 'Pode ser o documento em papel ou um print do aplicativo e-Título.' },
        { id: 'certidao', nome: 'Certidão de nascimento ou casamento', icone: 'file', obrigatorio: true,
          dica: 'Se for casado(a), envie a certidão de casamento. Se não, a de nascimento.' },
        { id: 'escolaridade', nome: 'Comprovante de escolaridade', icone: 'graduation', obrigatorio: true,
          dica: 'Diploma, certificado ou declaração da escola.' },
        { id: 'banco', nome: 'Dados bancários', icone: 'bank', obrigatorio: true,
          dica: 'Foto do cartão do banco ou print do aplicativo mostrando agência e número da conta.' },
        { id: 'foto', nome: 'Sua foto (tipo 3x4)', icone: 'user', obrigatorio: true,
          dica: 'Fique na frente de uma parede clara, sem boné e sem óculos escuros. Se puder, peça para alguém tirar.' },
        { id: 'cpf', nome: 'CPF', icone: 'idCard', obrigatorio: false,
          dica: 'Só é necessário se o número do CPF não aparece no seu RG.' },
        { id: 'reservista', nome: 'Certificado de reservista', icone: 'award', obrigatorio: false,
          dica: 'Somente para homens com até 45 anos.' },
        { id: 'filhos', nome: 'Certidão de nascimento dos filhos', icone: 'heart', obrigatorio: false,
          dica: 'Apenas dos filhos menores de 14 anos. Se tiver mais de um, envie um PDF ou junte na mesma foto.' },
      ],
    },
  },
};
