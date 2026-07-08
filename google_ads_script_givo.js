/**
 * GIVO — Exportador diário Google Ads → Google Sheets
 * ----------------------------------------------------
 * Onde rodar: dentro da conta de anúncios do Google Ads
 * (Ferramentas e configurações → Ações em massa → Scripts → + novo script)
 *
 * O QUE FAZ:
 * 1. Pega os números da conta e de cada campanha do dia (roda 1x/dia via agendamento).
 * 2. Escreve/atualiza uma linha por dia nas abas "Diario" e "Campanhas" da planilha.
 * 3. Nunca duplica: se já existe uma linha para o dia, ela é atualizada, não duplicada.
 *
 * PASSO A PASSO PRA INSTALAR:
 * 1. Crie uma Google Sheet nova (sheets.google.com → planilha em branco).
 *    Nomeie como quiser, ex: "Givo - Google Ads Diário".
 * 2. Compartilhe: botão "Compartilhar" → Acesso geral → "Qualquer pessoa com o link" → Leitor.
 *    (Leitor é suficiente — quem vai ESCREVER na planilha é este script, rodando com a
 *    autorização da própria conta Google que o instalar, não por link público.)
 * 3. Copie a URL completa da planilha (algo como
 *    https://docs.google.com/spreadsheets/d/1AbCDefGhIJkLmNoPQrsTUVwxyZ/edit#gid=0)
 * 4. Cole essa URL na constante SHEET_URL logo abaixo, substituindo o placeholder.
 * 5. No Google Ads: Ferramentas e configurações (ícone de chave inglesa) → Ações em massa
 *    → Scripts → clique em "+" → apague o conteúdo de exemplo → cole este arquivo inteiro.
 * 6. Clique em "Visualizar" (Preview) — na primeira vez ele vai pedir autorização
 *    (permissão pra acessar a conta de anúncios e o Google Sheets). Autorize.
 * 7. Depois de rodar sem erro, clique em "Agendamento" (Schedule) → Diariamente,
 *    de madrugada (ex: 06:00, horário da conta) → Salvar.
 * 8. Pegue o ID da planilha (a parte entre /d/ e /edit na URL) e cole no dashboard,
 *    no campo "ID da Google Sheet".
 */

var SHEET_URL = 'https://docs.google.com/spreadsheets/d/1qvfv-8_WsWyidyyvige4Nd8BILIXFgSE82MtrtM-Uoo/edit?usp=sharing';

function main() {
  if (SHEET_URL.indexOf('COLE_AQUI') !== -1) {
    Logger.log('ERRO: edite a constante SHEET_URL no topo do script antes de rodar.');
    return;
  }

  var ss = SpreadsheetApp.openByUrl(SHEET_URL);
  var tz = AdsApp.currentAccount().getTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  exportarResumoConta(ss, today);
  exportarPorCampanha(ss, today);

  Logger.log('Exportação concluída para ' + today);
}

function exportarResumoConta(ss, today) {
  var sheet = ss.getSheetByName('Diario') || ss.insertSheet('Diario');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Data', 'Investido', 'Impressoes', 'Cliques', 'CPC', 'CTR', 'Conversoes']);
  }

  var query =
    "SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, " +
    "metrics.average_cpc, metrics.ctr, metrics.conversions " +
    "FROM customer WHERE segments.date = '" + today + "'";

  var rows = AdsApp.search(query);
  var cost = 0, impressions = 0, clicks = 0, conversions = 0;

  while (rows.hasNext()) {
    var row = rows.next();
    cost += row.metrics.costMicros / 1e6;
    impressions += row.metrics.impressions;
    clicks += row.metrics.clicks;
    conversions += row.metrics.conversions;
  }

  var cpc = clicks > 0 ? cost / clicks : 0;
  var ctr = impressions > 0 ? (clicks / impressions * 100) : 0;

  upsertRowByDate(sheet, today, [today, cost, impressions, clicks, cpc, ctr, conversions]);
}

function exportarPorCampanha(ss, today) {
  var sheet = ss.getSheetByName('Campanhas') || ss.insertSheet('Campanhas');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Data', 'Campanha', 'Status', 'Investido', 'Impressoes', 'Cliques', 'CPC', 'CTR', 'Conversoes']);
  }

  // Remove as linhas do dia de hoje antes de reescrever (evita duplicar campanhas)
  removerLinhasDoDia(sheet, today);

  var query =
    "SELECT campaign.name, campaign.status, metrics.cost_micros, metrics.impressions, " +
    "metrics.clicks, metrics.average_cpc, metrics.ctr, metrics.conversions " +
    "FROM campaign WHERE segments.date = '" + today + "'";

  var rows = AdsApp.search(query);
  var toAppend = [];

  while (rows.hasNext()) {
    var row = rows.next();
    var c = row.campaign, m = row.metrics;
    toAppend.push([
      today,
      c.name,
      c.status,
      m.costMicros / 1e6,
      m.impressions,
      m.clicks,
      m.averageCpc / 1e6,
      m.ctr * 100,
      m.conversions
    ]);
  }

  if (toAppend.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, toAppend[0].length).setValues(toAppend);
  }
}

function upsertRowByDate(sheet, dateStr, rowValues) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === dateStr) {
      sheet.getRange(i + 1, 1, 1, rowValues.length).setValues([rowValues]);
      return;
    }
  }
  sheet.appendRow(rowValues);
}

function removerLinhasDoDia(sheet, dateStr) {
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === dateStr) {
      sheet.deleteRow(i + 1);
    }
  }
}
