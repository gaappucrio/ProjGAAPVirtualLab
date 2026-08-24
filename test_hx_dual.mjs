import { TrocadorCalorLogico } from './js/domain/components/TrocadorCalorLogico.js';
import { Fluido } from './js/domain/components/Fluido.js';

const trocador = new TrocadorCalorLogico('hx1', 'HX-01', 0, 0);
trocador.uaWPorK = 1000;
trocador.registrarEntrada(10, 2, new Fluido('AguaFria', 997, 0.001, 10, 4184), 'in1');
trocador.registrarEntrada(5, 2, new Fluido('AguaQuente', 997, 0.001, 90, 4184), 'in2');
trocador.sincronizarMetricasFisicas();

console.log('F1 Out Temp:', trocador.temperaturaSaidaC);
console.log('F2 Out Temp:', trocador.temperaturaSaida2C);
console.log('Duty:', trocador.cargaTermicaW);

