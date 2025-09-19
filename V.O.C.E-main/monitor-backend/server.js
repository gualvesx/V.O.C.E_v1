// ================================================================
//                  IMPORTS E CONFIGURAÇÃO INICIAL
// ================================================================
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path'); // Módulo para lidar com caminhos de arquivos
const sqlite3 = require('sqlite3').verbose(); // Módulo do banco de dados

// Importa o classificador (usando a versão com fallback)
const classifier = require('./python_classifier.js');

const app = express();
const port = 3000;

// ================================================================
//                  CONFIGURAÇÃO DO EXPRESS
// ================================================================
// Configura o EJS como motor de visualização
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Habilita o servidor a servir arquivos estáticos (CSS, JS do cliente) da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

app.use(cors()); // Habilita o CORS
app.use(express.json()); // Habilita o parsing de JSON no corpo das requisições

// ================================================================
//                  BANCO DE DADOS (SQLite)
// ================================================================
// Conecta ao arquivo do banco de dados (será criado se não existir)
const db = new sqlite3.Database('./monitor.db', (err) => {
    if (err) {
        console.error("Erro ao abrir o banco de dados:", err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite.');
    }
});

// Cria as tabelas se elas não existirem
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        aluno_id TEXT NOT NULL,
        url TEXT NOT NULL,
        duration INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        categoria TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        nome_completo TEXT,
        turma TEXT
    )`);
});


// ================================================================
//                  ROTAS DA API (PARA EXTENSÃO E DASHBOARD)
// ================================================================

// ROTA PRINCIPAL DA EXTENSÃO: Recebe os dados, classifica, e salva no DB
app.post('/api/data', async (req, res) => {
  const dataFromExtension = req.body;
  console.log('Dados brutos recebidos:', dataFromExtension);

  try {
    const classificationPromises = dataFromExtension.map(log => classifier.categorizar(log.url));
    const categories = await Promise.all(classificationPromises);
    
    const enrichedData = dataFromExtension.map((log, index) => ({
      ...log,
      categoria: categories[index]
    }));
    
    console.log('Dados enriquecidos com classificador:', enrichedData);

    // Salva cada log no banco de dados
    const stmt = db.prepare("INSERT INTO logs (aluno_id, url, duration, timestamp, categoria) VALUES (?, ?, ?, ?, ?)");
    enrichedData.forEach(log => {
        stmt.run(log.aluno_id, log.url, log.durationSeconds, log.timestamp, log.categoria);
    });
    stmt.finalize();

    res.status(200).send({ message: 'Dados recebidos e salvos com sucesso.' });

  } catch (error) {
    console.error('Erro no processamento do servidor:', error);
    res.status(500).send({ message: 'Erro interno no servidor.' });
  }
});

// ROTA PARA O DASHBOARD: Pega a lista de usuários para os filtros
app.get('/api/users', (req, res) => {
    db.all("SELECT DISTINCT aluno_id FROM logs", [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows.map(row => row.aluno_id));
    });
});

// ROTA PARA O DASHBOARD: Envia relatório consolidado para o Power BI
app.post('/api/report-to-powerbi', (req, res) => {
    // Lógica para buscar os dados do DB, consolidar e enviar para uma URL de Push do Power BI
    // (Esta URL pode ser de um conjunto de dados diferente, não de streaming)
    console.log("Recebida solicitação para enviar relatório ao Power BI...");
    // ... Implementação futura
    res.status(200).send({ message: "Funcionalidade de relatório para Power BI a ser implementada." });
});


// ================================================================
//                  ROTAS DAS PÁGINAS WEB (RENDERIZAÇÃO COM EJS)
// ================================================================

// Rota principal do dashboard
app.get('/dashboard', (req, res) => {
    const sqlLogs = "SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100";
    const sqlUsers = "SELECT DISTINCT aluno_id FROM logs";

    db.all(sqlLogs, [], (err, logs) => {
        if (err) return res.status(500).send("Erro ao buscar logs.");
        
        db.all(sqlUsers, [], (err, users) => {
            if (err) return res.status(500).send("Erro ao buscar usuários.");

            // Renderiza o arquivo 'dashboard.ejs' e passa as variáveis para ele
            res.render('dashboard', { 
                logs: logs, 
                users: users.map(u => u.aluno_id),
                pageTitle: 'Dashboard de Monitoramento'
            });
        });
    });
});

// Redireciona a raiz do site para o dashboard
app.get('/', (req, res) => {
    res.redirect('/dashboard');
});


// ================================================================
//                  INICIALIZAÇÃO DO SERVIDOR
// ================================================================
app.listen(port, () => {
  console.log(`Servidor rodando! Acesse o dashboard em http://localhost:${port}/dashboard`);
});