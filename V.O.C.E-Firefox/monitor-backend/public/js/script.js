// --- VARIÁVEIS GLOBAIS ---
let mainChart;
let currentChartType = 'bar';

// --- FUNÇÕES DE RENDERIZAÇÃO ---

function updateChart(logs, type) {
    if (mainChart) mainChart.destroy();
    const siteUsage = logs.reduce((acc, log) => {
        acc[log.url] = (acc[log.url] || 0) + log.duration;
        return acc;
    }, {});
    const topSites = Object.entries(siteUsage).sort(([, a], [, b]) => b - a).slice(0, 10);
    const chartLabels = topSites.map(site => site[0]);
    const chartData = topSites.map(site => site[1]);
    const backgroundColors = ['rgba(255, 99, 132, 0.7)', 'rgba(54, 162, 235, 0.7)', 'rgba(255, 206, 86, 0.7)', 'rgba(75, 192, 192, 0.7)', 'rgba(153, 102, 255, 0.7)'];
    const ctx = document.getElementById('mainChart').getContext('2d');
    mainChart = new Chart(ctx, {
        type: type,
        data: {
            labels: chartLabels,
            datasets: [{ label: 'Tempo de Uso (s)', data: chartData, backgroundColor: type === 'bar' ? 'rgba(54, 162, 235, 0.7)' : backgroundColors }]
        },
        options: { indexAxis: type === 'bar' ? 'y' : 'x', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: type !== 'bar' } } }
    });
}

function updateLogsTable(logs) {
    const tableBody = document.getElementById('logsTableBody');
    tableBody.innerHTML = '';
    document.getElementById('logs-count').textContent = `(${logs.length} registos)`;
    if (logs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5">Nenhum registo encontrado.</td></tr>';
        return;
    }
    logs.forEach(log => {
        const isAlert = log.categoria === 'Rede Social' || log.categoria === 'Jogos';
        const row = `<tr class="${isAlert ? 'alert-row' : ''}">
            <td>${log.aluno_id}</td>
            <td><a href="http://${log.url}" target="_blank">${log.url}</a></td>
            <td>${log.duration}</td>
            <td><span class="category-tag ${log.categoria.replace(/\s+/g, '-').toLowerCase()}">${log.categoria || 'N/A'}</span></td>
            <td>${new Date(log.timestamp).toLocaleString('pt-BR')}</td>
        </tr>`;
        tableBody.innerHTML += row;
    });
}

function updateUserSummaryTable(users) {
    const tableBody = document.getElementById('usersTableBody');
    tableBody.innerHTML = '';
    if (users.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5">Nenhum utilizador encontrado.</td></tr>';
        return;
    }
    users.forEach(user => {
        const row = `<tr class="${user.has_alert ? 'alert-row' : ''}">
            <td><span class="alert-icon">${user.has_alert ? '⚠️' : '✅'}</span></td>
            <td>${user.aluno_id}</td>
            <td>${(user.total_duration / 60).toFixed(1)}</td>
            <td>${user.log_count}</td>
            <td>${new Date(user.last_activity).toLocaleString('pt-BR')}</td>
        </tr>`;
        tableBody.innerHTML += row;
    });
}

function updateAlertsTable(alerts) {
    const tableBody = document.getElementById('alertsTableBody');
    tableBody.innerHTML = '';
    if (alerts.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4">Nenhum alerta recente.</td></tr>';
        return;
    }
    alerts.forEach(log => {
        const row = `<tr>
            <td>${log.aluno_id}</td>
            <td>${log.url}</td>
            <td><span class="category-tag ${log.categoria.replace(/\s+/g, '-').toLowerCase()}">${log.categoria}</span></td>
            <td>${new Date(log.timestamp).toLocaleString('pt-BR')}</td>
        </tr>`;
        tableBody.innerHTML += row;
    });
}

// --- FUNÇÕES DE BUSCA DE DADOS (FETCH) ---

async function fetchUserSummary(searchTerm = '') {
    const query = new URLSearchParams({ search: searchTerm }).toString();
    const response = await fetch(`/api/users/summary?${query}`);
    const users = await response.json();
    updateUserSummaryTable(users);
}

async function fetchAlerts(user = '', site = '') {
    const query = new URLSearchParams({ user, site }).toString();
    const response = await fetch(`/api/alerts?${query}`);
    const alerts = await response.json();
    updateAlertsTable(alerts);
}

async function fetchFilteredLogs() {
    const user = document.getElementById('userFilter').value;
    const category = document.getElementById('categoryFilter').value;
    const site = document.getElementById('siteFilter').value;
    const query = new URLSearchParams({ user, category, site }).toString();
    const response = await fetch(`/api/logs/filtered?${query}`);
    const filteredLogs = await response.json();
    updateLogsTable(filteredLogs);
    updateChart(filteredLogs, currentChartType);
}

// --- PONTO DE ENTRADA DO SCRIPT ---

document.addEventListener('DOMContentLoaded', () => {
    // Carrega todos os dados na primeira vez
    fetchUserSummary();
    fetchAlerts();
    fetchFilteredLogs();

    // Configura os event listeners
    document.getElementById('applyFiltersBtn').addEventListener('click', fetchFilteredLogs);
    
    document.getElementById('clearFiltersBtn').addEventListener('click', () => {
        document.getElementById('userFilter').value = '';
        document.getElementById('categoryFilter').value = '';
        document.getElementById('siteFilter').value = '';
        fetchFilteredLogs();
    });
    
    // Pesquisa de Utilizadores (com debounce para não sobrecarregar a API)
    let userSearchTimeout;
    document.getElementById('userSearchInput').addEventListener('input', (e) => {
        clearTimeout(userSearchTimeout);
        userSearchTimeout = setTimeout(() => {
            fetchUserSummary(e.target.value);
        }, 300); // Espera 300ms após o utilizador parar de digitar
    });

    // Filtros da Tabela de Alertas
    let alertFilterTimeout;
    const applyAlertFilters = () => {
        const user = document.getElementById('alertUserFilter').value;
        const site = document.getElementById('alertSiteFilter').value;
        fetchAlerts(user, site);
    };
    document.getElementById('alertUserFilter').addEventListener('change', applyAlertFilters);
    document.getElementById('alertSiteFilter').addEventListener('input', () => {
        clearTimeout(alertFilterTimeout);
        alertFilterTimeout = setTimeout(applyAlertFilters, 300);
    });

    document.querySelectorAll('.chart-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentChartType = e.target.dataset.type;
            document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            fetchFilteredLogs();
        });
    });
});

