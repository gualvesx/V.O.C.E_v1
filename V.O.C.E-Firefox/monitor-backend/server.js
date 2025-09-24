// ================================================================
//                  IMPORTS E CONFIGURAÇÃO INICIAL
// ================================================================
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const mysql = require('mysql2/promise');
const classifier = require('./python_classifier.js');

const app = express();
const port = process.env.PORT || 8080;

// ================================================================
//                  CONFIGURAÇÃO DO EXPRESS (EJS, SESSÃO, ETC.)
// ================================================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'um_segredo_muito_forte_para_seu_tcc',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// ================================================================
//                  BANCO DE DADOS (MARIADB)
// ================================================================
const dbPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ================================================================
//                  MIDDLEWARE DE AUTENTICAÇÃO
// ================================================================
const requireLogin = (req, res, next) => {
    if (req.session && req.session.professorId) {
        return next();
    } else {
        res.redirect('/login');
    }
};

// ================================================================
//                  ROTAS PÚBLICAS CORRIGIDAS
// ================================================================

// Landing Page
app.get('/', (req, res) => res.render('landpage', { pageTitle: 'V.O.C.E - Monitorização Inteligente' }));

// Página de Login - GET
app.get('/login', async (req, res) => {
    try {
        const [organizations] = await dbPool.query("SELECT id, name FROM organizations ORDER BY name ASC");
        const message = req.query.message || null;
        res.render('login', { 
            error: null, 
            organizations, 
            message,
            pageTitle: 'Login - V.O.C.E' 
        });
    } catch (error) {
        res.render('login', { 
            error: 'Não foi possível carregar as organizações.', 
            organizations: [], 
            message: null,
            pageTitle: 'Login - V.O.C.E' 
        });
    }
});

// Processar Login - POST (VERSÃO CORRIGIDA)
app.post('/login', async (req, res) => {
    const { organizationId, username, password } = req.body;
    
    console.log('=== TENTATIVA DE LOGIN ===');
    console.log('Organization ID:', organizationId);
    console.log('Username:', username);
    
    try {
        const [organizations] = await dbPool.query("SELECT id, name FROM organizations ORDER BY name ASC");
        
        if (!organizationId || !username || !password) {
            return res.render('login', { 
                error: 'Todos os campos são obrigatórios.', 
                organizations, 
                pageTitle: 'Login - V.O.C.E' 
            });
        }

        // Buscar professor (consulta mais flexível para debug)
        const [rows] = await dbPool.query(
            "SELECT * FROM professors WHERE username = ?", 
            [username]
        );
        
        console.log('Professores encontrados com este username:', rows.length);
        
        if (rows.length === 0) {
            console.log('❌ Professor não encontrado');
            return res.render('login', { 
                error: 'Utilizador não encontrado.', 
                organizations, 
                pageTitle: 'Login - V.O.C.E' 
            });
        }

        const professor = rows[0];
        console.log('Professor encontrado:', professor.username);
        console.log('Organização do professor:', professor.organization_id);
        console.log('Organização selecionada:', organizationId);

        // Verificar se pertence à organização selecionada
        if (professor.organization_id != organizationId) {
            console.log('❌ Professor não pertence à organização selecionada');
            return res.render('login', { 
                error: 'Utilizador não encontrado nesta organização.', 
                organizations, 
                pageTitle: 'Login - V.O.C.E' 
            });
        }

        // Verificar senha
        const isMatch = await bcrypt.compare(password, professor.password_hash);
        console.log('Senha corresponde:', isMatch);
        
        if (isMatch) {
            req.session.professorId = professor.id;
            req.session.organizationId = professor.organization_id;
            req.session.professorName = professor.full_name;
            
            console.log('✅ Login bem-sucedido');
            console.log('Session:', req.session);
            
            res.redirect('/dashboard');
        } else {
            console.log('❌ Senha incorreta');
            res.render('login', { 
                error: 'Senha incorreta.', 
                organizations, 
                pageTitle: 'Login - V.O.C.E' 
            });
        }
    } catch (error) {
        console.error('💥 Erro no login:', error);
        res.status(500).render('login', { 
            error: 'Erro no servidor.', 
            organizations: [], 
            pageTitle: 'Login - V.O.C.E' 
        });
    }
});

// Página de Cadastro - GET (ATUALIZADA)
app.get('/cadastro', async (req, res) => {
    try {
        const [organizations] = await dbPool.query("SELECT id, name FROM organizations ORDER BY name ASC");
        res.render('cadastro', { 
            error: null, 
            organizations, 
            pageTitle: 'Cadastro - V.O.C.E' 
        });
    } catch (error) {
        console.error('Erro ao carregar organizações:', error);
        res.render('cadastro', { 
            error: 'Erro ao carregar organizações.', 
            organizations: [], 
            pageTitle: 'Cadastro - V.O.C.E' 
        });
    }
});

// Processar Cadastro - POST (ATUALIZADA)
app.post('/cadastro', async (req, res) => {
    const { organizationOption, organizationName, organizationSelect, fullName, username, password } = req.body;
    
    console.log('Dados recebidos no cadastro:', { 
        organizationOption, 
        organizationName, 
        organizationSelect, 
        fullName, 
        username 
    });
    
    try {
        // Validações básicas
        if (!fullName || !username || !password) {
            const [organizations] = await dbPool.query("SELECT id, name FROM organizations ORDER BY name ASC");
            return res.render('cadastro', { 
                error: 'Todos os campos são obrigatórios.', 
                organizations,
                pageTitle: 'Cadastro - V.O.C.E' 
            });
        }

        // Verificar se o usuário já existe
        const [existingUser] = await dbPool.query("SELECT id FROM professors WHERE username = ?", [username]);
        
        if (existingUser.length > 0) {
            const [organizations] = await dbPool.query("SELECT id, name FROM organizations ORDER BY name ASC");
            return res.render('cadastro', { 
                error: 'Nome de utilizador já existe. Escolha outro.', 
                organizations,
                pageTitle: 'Cadastro - V.O.C.E' 
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        let organizationId;

        // Lógica para organização
        if (organizationOption === 'existing' && organizationSelect) {
            // Usar organização existente
            organizationId = organizationSelect;
            console.log('Usando organização existente:', organizationId);
        } else if (organizationOption === 'new' && organizationName) {
            // Criar nova organização
            // Verificar se a organização já existe
            const [existingOrgs] = await dbPool.query("SELECT id FROM organizations WHERE name = ?", [organizationName]);
            
            if (existingOrgs.length > 0) {
                const [organizations] = await dbPool.query("SELECT id, name FROM organizations ORDER BY name ASC");
                return res.render('cadastro', { 
                    error: 'Já existe uma organização com este nome.', 
                    organizations,
                    pageTitle: 'Cadastro - V.O.C.E' 
                });
            }

            const [newOrg] = await dbPool.query("INSERT INTO organizations (name) VALUES (?)", [organizationName]);
            organizationId = newOrg.insertId;
            console.log('Nova organização criada:', organizationId, organizationName);
        } else {
            const [organizations] = await dbPool.query("SELECT id, name FROM organizations ORDER BY name ASC");
            return res.render('cadastro', { 
                error: 'Selecione ou crie uma organização.', 
                organizations,
                pageTitle: 'Cadastro - V.O.C.E' 
            });
        }

        // Criar professor
        await dbPool.query(
            "INSERT INTO professors (username, password_hash, full_name, organization_id) VALUES (?, ?, ?, ?)",
            [username, hashedPassword, fullName, organizationId]
        );

        console.log('Professor cadastrado com sucesso na organização:', organizationId);
        res.redirect('/login?message=Cadastro realizado com sucesso!');
        
    } catch (error) {
        console.error('Erro no cadastro:', error);
        const [organizations] = await dbPool.query("SELECT id, name FROM organizations ORDER BY name ASC");
        res.render('cadastro', { 
            error: 'Erro ao criar conta. Tente novamente.', 
            organizations,
            pageTitle: 'Cadastro - V.O.C.E' 
        });
    }
});

// Rota para solicitar adição de organização (API)
app.post('/api/organizations/request', async (req, res) => {
    const { organizationName, requesterName, requesterEmail } = req.body;
    
    try {
        // Aqui você pode implementar:
        // 1. Salvar em uma tabela de solicitações
        // 2. Enviar email para administrador
        // 3. Integrar com sistema de aprovação
        
        console.log('Solicitação de nova organização:', {
            organizationName,
            requesterName,
            requesterEmail,
            timestamp: new Date().toISOString()
        });
        
        res.json({ 
            success: true, 
            message: 'Solicitação enviada com sucesso. Entraremos em contato em breve.' 
        });
    } catch (error) {
        console.error('Erro na solicitação:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro ao processar solicitação.' 
        });
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Erro ao fazer logout:', err);
        }
        res.redirect('/');
    });
});

// ROTA PÚBLICA PARA A EXTENSÃO
app.post('/api/data', async (req, res) => {
    const dataFromExtension = req.body;
    try {
        const classificationPromises = dataFromExtension.map(log => classifier.categorizar(log.url));
        const categories = await Promise.all(classificationPromises);
        
        const enrichedData = dataFromExtension.map((log, index) => ({ ...log, categoria: categories[index] }));
        
        const sql = "INSERT INTO logs (aluno_id, url, duration, timestamp, categoria) VALUES ?";
        const values = enrichedData.map(log => [log.aluno_id, log.url, log.durationSeconds, log.timestamp, log.categoria]);

        if (values.length > 0) {
            await dbPool.query(sql, [values]);
        }

        console.log(`${enrichedData.length} logs salvos.`);
        res.status(200).send({ message: 'Dados recebidos e salvos.' });

    } catch (error) {
        console.error('Erro em /api/data:', error);
        res.status(500).send({ message: 'Erro interno no servidor.' });
    }
});


// ================================================================
//                  ROTAS PROTEGIDAS (DASHBOARD E API)
// ================================================================

// Página Principal do Dashboard - CORRIGIDA
app.get('/dashboard', requireLogin, async (req, res) => {
    try {
        const { professorId, organizationId, professorName } = req.session;

        console.log('=== CARREGANDO DASHBOARD ===');
        console.log('Session data:', { professorId, organizationId, professorName });

        const [classes] = await dbPool.query("SELECT id, name FROM classes WHERE professor_id = ?", [professorId]);
        const classIds = classes.map(c => c.id);

        let students = [];
        if (classIds.length > 0) {
            const [studentRows] = await dbPool.query("SELECT * FROM students WHERE class_id IN (?)", [classIds]);
            students = studentRows;
        }

        const [users] = await dbPool.query("SELECT DISTINCT aluno_id FROM logs");
        const [categories] = await dbPool.query("SELECT DISTINCT categoria FROM logs WHERE categoria IS NOT NULL");
        
        // CORREÇÃO: passar professorName como username para o template
        res.render('dashboard', {
            pageTitle: 'Dashboard do Professor',
            username: professorName,  // CORRIGIDO: era professorName, agora é username
            professorName: professorName,
            classes: classes,
            students: students,
            users: users.map(u => u.aluno_id),
            categories: categories.map(c => c.categoria)
        });
    } catch (error) {
        console.error("Erro ao carregar o dashboard:", error);
        res.status(500).send("Erro ao carregar o dashboard.");
    }
});

// API para adicionar uma turma
app.post('/api/classes', requireLogin, async (req, res) => {
    const { name } = req.body;
    const { professorId, organizationId } = req.session;
    await dbPool.query("INSERT INTO classes (name, professor_id, organization_id) VALUES (?, ?, ?)", [name, professorId, organizationId]);
    res.redirect('/dashboard');
});

// API para adicionar um aluno
app.post('/api/students', requireLogin, async (req, res) => {
    const { fullName, cpf, pc_id, class_id } = req.body;
    await dbPool.query("INSERT INTO students (full_name, cpf, pc_id, class_id) VALUES (?, ?, ?, ?)", [fullName, cpf || null, pc_id || null, class_id]);
    res.redirect('/dashboard');
});

// API para remover um aluno
app.post('/api/students/delete', requireLogin, async (req, res) => {
    const { studentId } = req.body;
    // Adicionar verificação para garantir que o professor só pode apagar alunos das suas turmas
    await dbPool.query("DELETE FROM students WHERE id = ?", [studentId]);
    res.redirect('/dashboard');
});

// APIs de dados para o frontend do dashboard
app.get('/api/users/summary', requireLogin, async (req, res) => { 
    try {
        const sql = `
            SELECT 
                s.full_name as student_name,
                l.aluno_id,
                SUM(l.duration) as total_duration,
                COUNT(l.id) as log_count,
                MAX(l.timestamp) as last_activity,
                SUM(CASE WHEN l.categoria IN ('Rede Social', 'Jogos') THEN 1 ELSE 0 END) > 0 as has_alert
            FROM logs l
            LEFT JOIN students s ON l.aluno_id = s.cpf OR l.aluno_id = s.pc_id
            GROUP BY l.aluno_id, s.full_name
            ORDER BY last_activity DESC;
        `;
        const [rows] = await dbPool.query(sql);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/alerts', requireLogin, async (req, res) => {
    try {
        const sql = "SELECT l.*, s.full_name as student_name FROM logs l LEFT JOIN students s ON l.aluno_id = s.cpf OR l.aluno_id = s.pc_id WHERE l.categoria IN ('Rede Social', 'Jogos') ORDER BY l.timestamp DESC LIMIT 100";
        const [rows] = await dbPool.query(sql);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/logs/filtered', requireLogin, async (req, res) => {
    const { user, category, site } = req.query;
    let query = "SELECT l.*, s.full_name as student_name FROM logs l LEFT JOIN students s ON l.aluno_id = s.cpf OR l.aluno_id = s.pc_id WHERE 1=1";
    const params = [];

    if (user) {
        query += " AND l.aluno_id = ?";
        params.push(user);
    }
    if (category) {
        query += " AND l.categoria = ?";
        params.push(category);
    }
    if (site) {
        query += " AND l.url LIKE ?";
        params.push(`%${site}%`);
    }
    query += " ORDER BY l.timestamp DESC LIMIT 500";

    try {
        const [rows] = await dbPool.query(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================================================================
//                  INICIALIZAÇÃO DO SERVIDOR
// ================================================================
app.listen(port, () => {
  console.log(`Servidor a rodar! Aceda à aplicação em http://localhost:${port}`);
});

