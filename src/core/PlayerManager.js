/* src/core/PlayerManager.js */

import AvatarSystem from './AvatarSystem.js';

export default class PlayerManager {
    constructor() {
        const accs = AvatarSystem.ACCESSORIES;
        const getRandomAcc = () => accs[Math.floor(Math.random() * accs.length)];

        this.players = [
            { id: 0, type: 'local', uuid: 'local-1', name: 'Red', color: '#E24A4A', key: 'Shift', label: 'L-Shift', variant: 'default', accessory: getRandomAcc() },
            { id: 1, type: 'local', uuid: 'local-2', name: 'Yellow', color: '#F4B84D', key: ' ', label: 'Space', variant: 'feminine', accessory: getRandomAcc() }
        ];

        // Extended palette supporting 2 to 10+ players with high contrast
        this.colors = [
            '#2ECC71', '#3498DB', '#9B59B6', '#E67E22', 
            '#1ABC9C', '#E84393', '#34495E', '#D35400', 
            '#00CEC9', '#6C5CE7', '#0984E3', '#FDCB6E'
        ];
        
        const saved = localStorage.getItem('arcade_players');
        if (saved) {
            try { 
                const parsed = JSON.parse(saved);
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
    getPlayerByUUID(uuid) { return this.players.find(p => p.uuid === uuid); }

    savePlayers() {
        const localOnly = this.players.filter(p => p.type === 'local');
        localStorage.setItem('arcade_players', JSON.stringify(localOnly));
    }

    addPlayer(type = 'local', uuid = null) {
        const nextId = this.players.length > 0 ? Math.max(...this.players.map(p => p.id)) + 1 : 0;
        const usedColors = this.players.map(p => p.color.toUpperCase());
        const color = this.colors.find(c => !usedColors.includes(c.toUpperCase())) || '#7A6F68';

        // Keyboard bindings supporting up to 10 local players
        const inputPool = [
            { key: 'Shift', label: 'L-Shift' }, 
            { key: ' ', label: 'Space' },
            { key: 'Enter', label: 'Enter' },
            { key: '+', label: '+' },
            { key: 'z', label: 'Z' }, 
            { key: 'm', label: 'M' },
            { key: 'q', label: 'Q' },
            { key: 'p', label: 'P' },
            { key: 'c', label: 'C' },
            { key: 'b', label: 'B' }
        ];

        let keyConfig = { key: null, label: 'Mobile' };
        
        if (type === 'local') {
            const usedKeys = this.players.map(p => p.key);
            const available = inputPool.find(i => !usedKeys.includes(i.key));
            if (available) keyConfig = available;
            else return null; 
        }

        // Random accessory selection upon join
        const accs = AvatarSystem.ACCESSORIES;
        const randomAccessory = accs[Math.floor(Math.random() * accs.length)];

        const newPlayer = {
            id: nextId,
            uuid: uuid || `temp-${Date.now()}`,
            type: type,
            name: `P${nextId + 1}`,
            color: color,
            key: keyConfig.key,
            label: keyConfig.label,
            variant: 'default',
            accessory: randomAccessory
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