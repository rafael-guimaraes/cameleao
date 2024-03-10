const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const salas = {};
const sala_atual = {};

const gerar_id_aleatorio = () => {
    return Math.random().toString(36).substr(2, 6);
};

const criar_sala = () => {
    let id_sala = gerar_id_aleatorio();
    while (salas[id_sala]) {
        id_sala = gerar_id_aleatorio();
    }
    salas[id_sala] = {
        usuarios: {},
        dono: null,
        temas: [],
        rodada_iniciada: false
    };
    return id_sala;
};

const iniciar_rodada = (id_sala) => {
    if (salas[id_sala].rodada_iniciada) {
        return;
    }
    salas[id_sala].rodada_iniciada = true;
    let tempo_restante = 15; 
    const timer_interval = setInterval(() => {
        if (tempo_restante <= 0 || salas[id_sala].temas.length == Object.keys(salas[id_sala].usuarios).length) {
            clearInterval(timer_interval);
            tempo_esgotado(id_sala);
            return;
        }
        io.to(id_sala).emit('atualizar_tempo', tempo_restante);
        tempo_restante--;
    }, 1000);
    io.to(id_sala).emit('rodada_iniciada', tempo_restante);
};

const enviar_tema = (id_sala, id_usuario, tema) => {
    if (!salas[id_sala].rodada_iniciada) {
        return;
    }
    if (salas[id_sala].temas.some(t => t.id_usuario === id_usuario)) {
        return; 
    }
    salas[id_sala].temas.push({ id_usuario, tema });
};

const tempo_esgotado = (id_sala) => {
    const usuarios_ids = Object.keys(salas[id_sala].usuarios);
    const indice_sorteado = Math.floor(Math.random() * usuarios_ids.length);
    const usuario_sorteado = salas[id_sala].usuarios[usuarios_ids[indice_sorteado]];

    io.to(usuario_sorteado.id).emit('camaleao');

    const outros_temas = salas[id_sala].temas.filter(tema => tema.id_usuario !== usuario_sorteado.id);
    const outros_usuarios = usuarios_ids.filter(id => id !== usuario_sorteado.id);
    if (outros_temas.length > 0) {
        const tema_rodada = outros_temas[Math.floor(Math.random() * outros_temas.length)];
        
        outros_usuarios.forEach(id => {
            const usuario = salas[id_sala].usuarios[id];
            io.to(usuario.id).emit('tema_rodada', tema_rodada.tema);
        });
    }
};

app.use(express.static(path.join(__dirname, 'public')));

io.on('connect', (socket) => {
    socket.on('criar_sala', () => {
        if (sala_atual[socket.id]) {
            socket.emit('erro', 'Você já está em uma sala. Por favor, saia dela antes de criar outra.');
            return;
        }

        const id_sala = criar_sala();
        socket.emit('sala_criada', id_sala);
    });

    socket.on('entrar_sala', ({ id_sala, nome_usuario }) => {
        if (sala_atual[socket.id] != null) {
            socket.emit('erro', 'Você já está em uma sala. Por favor, saia dela antes de entrar em outra.');
            return;
        }
        if (!salas[id_sala]) {
            socket.emit('erro', 'Sala não encontrada. Por favor, verifique o ID da sala.');
            return;
        }
        entrar_sala(socket, id_sala, nome_usuario);
        socket.emit('sala_entrar', salas[id_sala]);
    });

    socket.on('sair_sala', () => {
        sair_sala(socket);
        socket.emit('sala_sair');
    });
    
    socket.on('listar_salas', () => {
        listar_salas();
    });
    
    socket.on('disconnect', () => {
        if (sala_atual[socket.id]) {
            sair_sala(socket, sala_atual[socket.id]);
        }
    });

    socket.on('iniciar_rodada', (id_sala) => {
        iniciar_rodada(id_sala);
    });

    socket.on('enviar_tema', (tema) => {
        enviar_tema(sala_atual[socket.id], socket.id, tema);
    });

    const entrar_sala = (socket, id_sala, nome_usuario) => {
        if (!nome_usuario) {
            socket.emit('erro', 'É necessário definir um nome de usuário.');
            return;
        }
        if (!salas[id_sala]) {
            socket.emit('erro', 'Sala não encontrada. Por favor, verifique o ID da sala.');
            return;
        }
    
        const usuariosSala = Object.values(salas[id_sala].usuarios);
        const usuarioExistente = usuariosSala.find(usuario => usuario.nome.toLowerCase() === nome_usuario.toLowerCase());
        if (usuarioExistente) {
            socket.emit('erro', 'Já existe um usuário com o mesmo nome nesta sala. Por favor, escolha outro nome.');
            return;
        }
    
        socket.join(id_sala);
        const dono = Object.keys(salas[id_sala].usuarios).length === 0 || !salas[id_sala].usuarios;
        if (dono)
            salas[id_sala].dono = {id: socket.id, nome: nome_usuario};
    
        salas[id_sala].usuarios[socket.id] = { id: socket.id, nome: nome_usuario, dono };
        sala_atual[socket.id] = id_sala;
        listar_salas();
        atualizar_lista_usuarios(id_sala);
    };

    
    const sair_sala = (socket) => {
        if (!sala_atual[socket.id]) {
            return; 
        }
    
        const id_sala = sala_atual[socket.id];
        
        if (!salas[id_sala] || !salas[id_sala].usuarios) {
            return; 
        }
    
        delete salas[id_sala].usuarios[socket.id];
        
        if (Object.keys(salas[id_sala].usuarios).length === 0) {
            delete salas[id_sala];
        } else {
            atualizar_dono(id_sala);
            atualizar_lista_usuarios(id_sala);
        }
        listar_salas();
        sala_atual[socket.id] = null; 
        socket.leave(id_sala);
    };

    const listar_salas = () => {
        const salas_disponiveis = Object.keys(salas).map(id => ({ id, dono: salas[id].dono }));
        io.emit('salas_disponiveis', salas_disponiveis);
    };
    
    
    const atualizar_lista_usuarios = (id_sala) => {
        if (salas[id_sala]) {
            const usuarios = Object.values(salas[id_sala].usuarios);
            io.to(id_sala).emit('lista_usuarios', usuarios);
        }
    };

    const atualizar_dono = (id_sala) => {
        if (salas[id_sala]) {
            const usuarios_ids = Object.keys(salas[id_sala].usuarios);
            if (!usuarios_ids.includes(salas[id_sala].dono)) {
                const novo_dono_id = usuarios_ids[0];
                salas[id_sala].dono = {id: novo_dono_id, nome: salas[id_sala].usuarios[novo_dono_id].nome};
                io.to(id_sala).emit('novo_dono', novo_dono_id);
                try {
                    salas[id_sala].usuarios[novo_dono_id].dono = true;
                } catch { }
            }
        }
    };
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Servidor está rodando na porta ${PORT}`);
});
