const path = require('path');
const http = require('http');
const express = require('express');
const socketio = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

salas = {}
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

io.on('connection', socket => {
    socket.on('entrar_sala', (data) => { 
        if (salas[data.id_sala] == undefined) {
            socket.emit('erro', 'Essa sala não existe!');
            return;
        }
    
        const nomeUsuarioExistente = salas[data.id_sala].pessoas.find(pessoa => pessoa.nome.toLowerCase() === data.nome_usuario.toLowerCase());
        if (nomeUsuarioExistente) {
            socket.emit('erro', 'Esse nome de usuário já está em uso na sala!');
            return;
        }
    
        let usuario = { id: socket.id, nome: data.nome_usuario };
        if (salas[data.id_sala].pessoas.length === 0) {
            salas[data.id_sala].dono = usuario;
        }
        salas[data.id_sala].pessoas.push(usuario);
        socket.join(data.id_sala);
        atualizarListaPessoasNaSala(data.id_sala);
      
    });

    socket.on('disconnect', () => {
        for (const [sala_id, sala] of Object.entries(salas)) {
            const index = sala.pessoas.findIndex(user => user.id === socket.id);
            if (index !== -1) {
                sala.pessoas.splice(index, 1);
                if (sala.dono && sala.dono.id === socket.id) {
                    if (sala.pessoas.length > 0)
                        sala.dono = sala.pessoas[0]
                    else
                        delete salas[sala_id];
                }
                socket.leave(sala_id);
                atualizarListaPessoasNaSala(sala_id);
            }
        }
       
    });
    socket.on('iniciar_rodada', () => {
        
        const sala_id = sala_usuario(socket.id)
       
        if (sala_id != null && salas[sala_id].rodada == false)
            rodada(sala_id);
    });
    socket.on('temas', (valores) => {
        const sala_id = sala_usuario(socket.id);

        if (!salas[sala_id] || !salas[sala_id].rodada) {
            return;
        }

        if (salas[sala_id].temas && salas[sala_id].temas.some(t => t.usuario_id === socket.id)) {
            return;
        }
    
        if (!salas[sala_id].temas) {
            salas[sala_id].temas = [];
        }
        salas[sala_id].temas.push({ usuario_id: socket.id, tema: valores.tema });
        
    });
});

function rodada(sala_id){
    salas[sala_id].rodada = true;
    let tempo_restante = 30;
    const timer_interval = setInterval(() => {
        if (salas[sala_id] == undefined) return;
        if (tempo_restante <= 0 || salas[sala_id].temas.length == salas[sala_id].pessoas.length) {
            
            clearInterval(timer_interval);
            finalizar_rodada(sala_id);
            return;
        }
        io.to(sala_id).emit('rodada', {estado: 'entrada', tempo: tempo_restante});
        tempo_restante--;
    }, 1000);
    io.to(sala_id).emit('rodada', {estado: 'iniciado' });
}

function finalizar_rodada(sala_id) {
    const sala = salas[sala_id];
    const pessoas = sala.pessoas;
    const indice_sorteado = Math.floor(Math.random() * pessoas.length);
    const usuario_sorteado = pessoas[indice_sorteado];

    io.to(usuario_sorteado.id).emit('rodada', { estado: 'jogo', tema: '', camaleao: true});
    
    const outros_temas = sala.temas; 
    let indice_tema = Math.floor(Math.random() * outros_temas.length);
    while(outros_temas[indice_tema].usuario_id == usuario_sorteado.id){
        indice_tema = Math.floor(Math.random() * outros_temas.length);
    }
    pessoas.forEach(usuario => {
        if (usuario.id !== usuario_sorteado.id) {
            io.to(usuario.id).emit('rodada', { estado: 'jogo', tema: outros_temas[indice_tema].tema, camaleao: false });
        }
    });
    salas[id_sala].rodada = false;
    salas[id_sala].temas = [];
}


function sala_usuario(id){
    for (const [sala_id, sala] of Object.entries(salas)) {
        const usuarioNaSala = sala.pessoas.find(usuario => usuario.id === id);
        if (usuarioNaSala) {
            return sala_id;
        }
    }
    return null; 
} 
function atualizarListaPessoasNaSala(sala_id) {
    if (!salas[sala_id]) {
        return;
    }
    io.to(sala_id).emit('atualizar_pessoas_sala', salas[sala_id]);
}

function gerar_id() {
    return Math.random().toString(36).substr(2, 6);
}

const criar_sala = (nome) => {
    id_sala = gerar_id()
    while(salas[id_sala] != undefined)
        id_sala = gerar_id()
    salas[id_sala] = {nome: `Sala de ${nome}`, dono: undefined, rodada: false, pessoas: [], temas: []}
    return id_sala
};

app.get('/', (req, res) => {
    res.render('index');
});

app.post('/criar-sala', (req, res) => {
    const nome = req.body.nome;
    const sala_id = criar_sala(nome); 
    res.redirect(`/sala/${sala_id}/${nome}`);
});


app.post('/entrar-sala', (req, res) => {
    const nome = req.body.nome;
    const sala_id = req.body.sala_id;
    res.redirect(`/sala/${sala_id}/${nome}`);
});

app.get('/sala/:sala_id/:nome', (req, res) => {
    const nome = req.params.nome; 
    const sala_id = req.params.sala_id;
    res.render('sala', { nome: nome, sala_id: sala_id });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando em ${PORT}`));
 