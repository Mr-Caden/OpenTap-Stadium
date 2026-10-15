/* src/core/PlayerManager.js */

export default class PlayerManager {
    constructor() {
        this.players = [
            { id: 0, type: 'local', uuid: 'local-1', name: 'Red', color: '#E24A4A', key: 'Shift', label: 'L-Shift', variant: 'default', accessory: 'Cat Ears' },
            { id: 1, type: 'local', uuid: 'local-2', name: 'Yellow', color: '#F4B84D', key: ' ', label: 'Space', variant: 'feminine', accessory: 'Bow' }
        ];

        this.colors = ['#2ecc71', '#e67e22', '#1abc9c', '#e84393', '#9b59b6', '#3498db'];
        
        const saved = localStorage.getItem('arcade_players');
        if (saved) {
            try { 
                const parsed = JSON.parse(saved);
                // Ensure local players have UUIDs (legacy fix)
                this.players = parsed.filter(p => p.type === 'local').map((p, i) => ({
                    ...p,
                    uuid: p.uuid || `local-${i+1}`
                }));
            } catch (e) { }
        }
    }

    getActivePlayers() { return this.players; }
    getPlayer(index) { return this.players[index]; }
    getPlayerById(id) { return this.players.find(p => p.id === id); }
    
    // --- KEY FOR RECONNECTION ---
    getPlayerByUUID(uuid) { return this.players.find(p => p.uuid === uuid); }

    savePlayers() {
        const localOnly = this.players.filter(p => p.type === 'local');
        localStorage.setItem('arcade_players', JSON.stringify(localOnly));
    }

    addPlayer(type = 'local', uuid = null) {
        const nextId = this.players.length > 0 ? Math.max(...this.players.map(p => p.id)) + 1 : 0;
        const usedColors = this.players.map(p => p.color);
        const color = this.colors.find(c => !usedColors.includes(c)) || '#333';

        const inputPool = [
            { key: 'Shift', label: 'L-Shift' }, { key: ' ', label: 'Space' },
            { key: '+', label: '+' }, { key: 'Enter', label: 'Enter' },
            { key: 'z', label: 'Z' }, { key: 'm', label: 'M' }
        ];

        let keyConfig = { key: null, label: 'Mobile' };
        
        if (type === 'local') {
            const usedKeys = this.players.map(p => p.key);
            const available = inputPool.find(i => !usedKeys.includes(i.key));
            if (available) keyConfig = available;
            else return null; 
        }

        const newPlayer = {
            id: nextId,
            uuid: uuid || `temp-${Date.now()}`,
            type: type,
            name: `P${nextId + 1}`,
            color: color,
            key: keyConfig.key,
            label: keyConfig.label,
            variant: 'default',
            accessory: 'Bear Ears'
        };

        this.players.push(newPlayer);
        
        if (type === 'local') this.savePlayers();
        
        return newPlayer;
    }

    removePlayer(index) {
        if (this.players.length <= 2 && this.players[index].type === 'local') return;
        const p = this.players[index];
        this.players.splice(index, 1);
        if (p.type === 'local') this.savePlayers();
    }

    removePlayerById(id) {
        const p = this.players.find(pl => pl.id === id);
        if (p) {
            this.players = this.players.filter(pl => pl.id !== id);
            if (p.type === 'local') this.savePlayers();
        }
    }

    updatePlayer(id, data) {
        const idx = this.players.findIndex(p => p.id === id);
        if (idx !== -1) {
            this.players[idx] = { ...this.players[idx], ...data };
            if (this.players[idx].type === 'local') this.savePlayers();
        }
    }
}
