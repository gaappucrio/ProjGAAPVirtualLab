import { ENGINE } from '../../MotorFisico.js';
import { ConnectionService } from './ConnectionService.js';

export const connectionService = new ConnectionService(ENGINE);
