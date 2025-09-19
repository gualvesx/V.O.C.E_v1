// ================================================================
//                  IMPORTS E CONFIGURAÇÃO INICIAL
// ================================================================
require('dotenv').config(); // Carrega as variáveis do arquivo .env
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const mysql = require('mysql2/promise'); // Driver para MySQL/MariaDB com suporte a Promises

// Importa o classificador (usando a versão com fallback para o dicionário simples)
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

app.use(cors()); // Habilita o CORS para a extensão e o dashboard
app.use(express.json()); // Habilita o parsing de JSON no corpo das requisições

// ================================================================
//                  BANCO DE DADOS (MARIADB)
// ================================================================
// Cria um "pool" de conexões, que é mais eficiente para gerenciar múltiplas conexões
const dbPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Função para verificar e criar tabelas (executada na inicialização)
async function setupDatabase() {
    try {
        const connection = await dbPool.getConnection();
        console.log('Conectado ao banco de dados MariaDB com sucesso.');

        await connection.query(`
            CREATE TABLE IF NOT EXISTS logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                aluno_id VARCHAR(255) NOT NULL,
                url VARCHAR(2048) NOT NULL,
                duration INT NOT NULL,
                timestamp VARCHAR(255) NOT NULL,
                categoria VARCHAR(255)
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                nome_completo VARCHAR(255),
                turma VARCHAR(255)
            )
        `);

        console.log('Tabelas verificadas/criadas com sucesso.');
        connection.release();
    } catch (error) {
        console.error('Erro ao conectar ou configurar o banco de dados:', error);
    }
}

setupDatabase();


// ================================================================
//                  ROTAS DA API (PARA EXTENSÃO E DASHBOARD)
// ================================================================

// ROTA DA EXTENSÃO: Recebe os dados, classifica e salva no DB
app.post('/api/data', async (req, res) => {
    const dataFromExtension = req.body;
    console.log('Dados brutos recebidos:', dataFromExtension.length, 'logs');

    try {
        const classificationPromises = dataFromExtension.map(log => classifier.categorizar(log.url));
        const categories = await Promise.all(classificationPromises);
        
        const enrichedData = dataFromExtension.map((log, index) => ({
            ...log,
            categoria: categories[index]
        }));
        
        console.log('Dados enriquecidos com classificador:', enrichedData);

        const sql = "INSERT INTO logs (aluno_id, url, duration, timestamp, categoria) VALUES ?";
        // Prepara os dados para inserção em massa
        const values = enrichedData.map(log => [log.aluno_id, log.url, log.durationSeconds, log.timestamp, log.categoria]);

        await dbPool.query(sql, [values]);

        console.log(`${enrichedData.length} logs salvos no banco de dados.`);
        res.status(200).send({ message: 'Dados recebidos e salvos com sucesso.' });

    } catch (error) {
        console.error('Erro no processamento da rota /api/data:', error);
        res.status(500).send({ message: 'Erro interno no servidor.' });
    }
});

// ROTA PARA O DASHBOARD: Pega a lista de usuários únicos para os filtros
app.get('/api/users', async (req, res) => {
    try {
        const [rows] = await dbPool.query("SELECT DISTINCT aluno_id FROM logs ORDER BY aluno_id ASC");
        res.json(rows.map(row => row.aluno_id));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// ================================================================
//                  ROTAS DAS PÁGINAS WEB (RENDERIZAÇÃO COM EJS)
// ================================================================

// Rota principal do dashboard
app.get('/dashboard', async (req, res) => {
    try {
        const sqlLogs = "SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100";
        const sqlUsers = "SELECT DISTINCT aluno_id FROM logs ORDER BY aluno_id ASC";

        const [logs] = await dbPool.query(sqlLogs);
        const [users] = await dbPool.query(sqlUsers);
        
        res.render('dashboard', { 
            logs: logs, 
            users: users.map(u => u.aluno_id),
            pageTitle: 'Dashboard de Monitoramento'
        });
    } catch (error) {
        console.error("Erro ao renderizar o dashboard:", error);
        res.status(500).send("Erro ao buscar dados para o dashboard.");
    }
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