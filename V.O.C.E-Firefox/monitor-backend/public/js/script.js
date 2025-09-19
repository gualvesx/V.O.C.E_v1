document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard carregado. Dados iniciais:', initialLogs);

    // Mapeia e agrupa os dados para o gráfico
    const siteUsage = {};
    initialLogs.forEach(log => {
        siteUsage[log.url] = (siteUsage[log.url] || 0) + log.duration;
    });

    // Pega os 10 sites mais usados para não poluir o gráfico
    const topSites = Object.entries(siteUsage)
        .sort(([,a],[,b]) => b-a)
        .slice(0, 10);

    const chartLabels = topSites.map(site => site[0]);
    const chartData = topSites.map(site => site[1]);

    // Cria o gráfico com Chart.js
    const ctx = document.getElementById('mainChart').getContext('2d');
    const mainChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'Tempo de Uso (segundos)',
                data: chartData,
                backgroundColor: 'rgba(54, 162, 235, 0.6)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y', // Deixa o gráfico na horizontal para melhor leitura
            scales: {
                x: {
                    beginAtZero: true
                }
            }
        }
    });

    // Lógica para o botão do Power BI (placeholder)
    const powerBiButton = document.getElementById('sendToPowerBiBtn');
    powerBiButton.addEventListener('click', () => {
        alert('Enviando relatório para o Power BI...');
        fetch('/api/report-to-powerbi', { method: 'POST' })
            .then(response => response.json())
            .then(data => alert(data.message))
            .catch(err => alert('Erro ao enviar relatório.'));
    });
});