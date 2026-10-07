import { RatTunnel } from "./RatTunnel.js";

export class RoomManager {
  constructor(roomData, tunnelData, progression, connections = []) {
    this.rooms = roomData;
    this.progression = progression;
    this.tunnels = new Map(tunnelData.map((tunnel) => [tunnel.roomId, new RatTunnel(tunnel)]));
    this.currentRoomId = "greatHall";
    this.adjacentRooms = new Map([...this.rooms.keys()].map((id) => [id, new Set([id])]));
    for (const { from, to } of connections) {
      this.adjacentRooms.get(from)?.add(to);
      this.adjacentRooms.get(to)?.add(from);
    }
  }

  updateCurrentRoom(position) {
    for (const room of this.rooms.values()) {
      const b = room.bounds;
      if (position.x >= b.minX && position.x <= b.maxX && position.z >= b.minZ && position.z <= b.maxZ) {
        if (this.currentRoomId !== room.id) {
          this.currentRoomId = room.id;
          return room;
        }
        return null;
      }
    }
    return null;
  }

  nearbyTunnel(position, roomId = this.currentRoomId) {
    this.lastTunnelChecks = 0;
    const tunnel = this.tunnels.get(roomId);
    this.lastTunnelChecks = Number(Boolean(tunnel));
    return tunnel?.isNear(position) ? tunnel : null;
  }

  discover(tunnel) {
    return tunnel ? this.progression.discoverTunnel(tunnel.roomId) : false;
  }

  destinations() {
    return [...this.rooms.values()].filter((room) => this.progression.discoveredTunnels.has(room.id) || (room.id === "throneRoom" && this.progression.crownComplete));
  }
}
