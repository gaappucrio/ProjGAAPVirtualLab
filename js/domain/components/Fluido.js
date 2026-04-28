export class Fluido {
    constructor(nome = 'Água', densidade = 997.0, viscosidade = 1.0, temperatura = 25.0) {
        this.nome = nome;
        this.densidade = densidade;
        this.viscosidade = viscosidade;
        this.temperatura = temperatura;
        this.viscosidadeDinamicaPaS = 0.001;
        this.pressaoVaporBar = 0.0317;
        this.pressaoAtmosfericaBar = 1.01325;
    }
}
