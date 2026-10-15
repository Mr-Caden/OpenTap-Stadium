/* src/core/NetworkManager.js */

export default class NetworkManager {
    constructor(playerManager, inputManager) {
        this.players = playerManager;
        this.input = inputManager;
        this.peer = null;
        this.connections = new Map();
        this.roomId = null;
        this.systemLag = 0; 
        
        // Corrected loop call
        setInterval(() => this.maintenanceLoop(), 1000);
    }

    async hostGame() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        this.roomId = '';
        for (let i = 0; i < 4; i++) this.roomId += chars.charAt(Math.floor(Math.random() * chars.length));

        this.peer = new window.Peer(`wonder-${this.roomId}`);
        this.peer.on('open', (id) => {
            console.log(`📡 Host Started: ${this.roomId}`);
            if (this.onHostReady) this.onHostReady(this.roomId);
        });
        this.peer.on('connection', (c) => this.handleConnection(c));
    }

    handleConnection(conn) {
        conn.on('open', () => { conn.send({ type: 'WHO_ARE_YOU' }); });
        conn.on('data', (data) => this.handleData(conn, data));
        conn.on('close', () => { this.disconnectPeer(conn.peer); });
        conn.on('error', () => { this.disconnectPeer(conn.peer); });
    }

    handleData(conn, data) {
        if (data.type === 'HELLO') { this.registerPlayer(conn, data.uuid); return; }
        const client = this.connections.get(conn.peer);
        if (!client) return; 
        client.lastHeartbeat = performance.now();

        switch (data.type) {
            case 'PONG': client.rtt = performance.now() - data.ts; this.recalculateLag(); break;
            case 'INPUT': this.input.triggerInput(client.playerId, data.action, true, data.payload); break;
            case 'UPDATE_PROFILE': this.players.updatePlayer(client.playerId, data.payload); window.dispatchEvent(new CustomEvent('player-update')); break;
            case 'COMMAND': window.dispatchEvent(new CustomEvent('remote-command', { detail: data })); break;
        }
    }

    registerPlayer(conn, uuid) {
        const existingPlayer = this.players.getPlayerByUUID(uuid);
        if (existingPlayer) {
            console.log(`♻️ RECONNECT: ${existingPlayer.name}`);
            for (const [peerId, client] of this.connections.entries()) {
                if (client.playerId === existingPlayer.id && peerId !== conn.peer) this.connections.delete(peerId);
            }
            this.connections.set(conn.peer, { conn, playerId: existingPlayer.id, lastHeartbeat: performance.now(), rtt: 0 });
            this.syncPlayerState(conn, existingPlayer);
        } else {
            console.log(`✨ NEW PLAYER: ${uuid}`);
            const newPlayer = this.players.addPlayer('mobile', uuid);
            this.connections.set(conn.peer, { conn, playerId: newPlayer.id, lastHeartbeat: performance.now(), rtt: 0 });
            this.syncPlayerState(conn, newPlayer);
            window.dispatchEvent(new CustomEvent('player-update'));
        }
    }

    syncPlayerState(conn, player) {
        this.sendToPhone(conn, {
            type: 'INIT', playerId: player.id,
            color: player.color, name: player.name,
            accessory: player.accessory, variant: player.variant
        });
    }

    disconnectPeer(peerId) {
        if (this.connections.has(peerId)) {
            this.connections.delete(peerId);
            this.recalculateLag();
        }
    }

    maintenanceLoop() {
        const now = performance.now();
        this.connections.forEach((client, peerId) => {
            if (client.conn.open) client.conn.send({ type: 'PING', ts: now });
            if (now - client.lastHeartbeat > 45000) {
                console.log(`💀 Zombie Reaper: Kicking Player ${client.playerId}`);
                if(client.conn.open) client.conn.send({ type: 'KICK' });
                this.players.removePlayerById(client.playerId);
                this.connections.delete(peerId);
                window.dispatchEvent(new CustomEvent('player-update'));
            }
        });
        this.recalculateLag();
    }

    recalculateLag() {
        if (this.connections.size === 0) { this.systemLag = 0; return; }
        let totalRTT = 0;
        this.connections.forEach(c => totalRTT += c.rtt);
        this.systemLag = Math.floor((totalRTT / this.connections.size) / 2);
    }

    broadcastState(stateType, context = 'IDLE', payload = {}) {
        this.connections.forEach((client) => {
            const player = this.players.getPlayerById(client.playerId);
            if(!player) return;
            const packet = {
                type: 'STATE_CHANGE', state: stateType, context: context,
                player: { color: player.color, name: player.name, accessory: player.accessory, variant: player.variant },
                ...payload
            };
            if(client.conn.open) client.conn.send(packet);
        });
    }

    sendToPhone(conn, data) { if (conn && conn.open) conn.send(data); }
}
