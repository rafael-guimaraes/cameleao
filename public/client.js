const socket = io();

function createRoom() {
    fetch('/create-room', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            const { roomId } = data;
            document.getElementById('room-container').style.display = 'none';
            document.getElementById('chat-container').style.display = 'block';
            joinRoom(roomId);
        })
        .catch(error => console.error('Error creating room:', error));
}

function joinRoom(roomId) {
    const username = document.getElementById('username-input').value;
    socket.emit('join-room', roomId, username);

    socket.on('update-user-list', (users) => {
        const userList = document.getElementById('user-list');
        userList.innerHTML = '';
        users.forEach(user => {
            const listItem = document.createElement('div');
            listItem.textContent = user.username;
            userList.appendChild(listItem);
        });
    });

    socket.on('new-message', (message) => {
        const messageContainer = document.getElementById('message-container');
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        messageContainer.appendChild(messageElement);
    });
}

function sendMessage() {
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value;
    const rooms = Object.keys(socket.rooms); 
    const roomId = rooms[1]; 
    socket.emit('send-message', roomId, message);
    messageInput.value = '';
}