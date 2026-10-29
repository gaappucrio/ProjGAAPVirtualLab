// =======================================
// DOMAIN: Referência das perdas nos bocais de tanques e drenos
// Arquivo: js/domain/components/BocalHidraulico.js
// =======================================

// Padrão (como no DWSIM, onde entrada e saída só existem como acessórios do cano): o K do bocal
// incide sobre a velocidade do cano. Com `usarGeometriaBocal` (aba Avançado), o bocal passa a ter
// o diâmetro próprio (`diametroConexaoM`): o K incide sobre a velocidade no bocal e a mudança
// brusca de seção entre o cano e o bocal soma a perda de transição.

/**
 * Perda de uma mudança brusca de seção, em K referido à área `areaReferenciaM2`.
 * Expansão (Borda-Carnot): K = (1 − A_montante/A_jusante)² na velocidade de montante.
 * Contração: K ≈ 0,5·(1 − A_jusante/A_montante) na velocidade de jusante.
 */
export function coeficienteTransicaoSecao(areaMontanteM2, areaJusanteM2, areaReferenciaM2) {
    if (!(areaMontanteM2 > 0) || !(areaJusanteM2 > 0) || !(areaReferenciaM2 > 0)) return 0;
    if (areaJusanteM2 >= areaMontanteM2) {
        const k = (1 - (areaMontanteM2 / areaJusanteM2)) ** 2;
        return k * ((areaReferenciaM2 / areaMontanteM2) ** 2);
    }
    const k = 0.5 * (1 - (areaJusanteM2 / areaMontanteM2));
    return k * ((areaReferenciaM2 / areaJusanteM2) ** 2);
}

/**
 * Coeficiente e área de referência da perda no bocal de um componente.
 * `kEnergiaCinetica` é a parcela de `kBocal` que cobra a energia cinética que segue no cano
 * (1 no 1/Cd² da saída do tanque). Com a geometria do bocal, essa parcela passa a ser a carga
 * cinética do cano, e não a do bocal; o restante de `kBocal` é perda no bocal.
 * @param sentido 'saida' (bocal → cano) ou 'entrada' (cano → bocal)
 * @returns {{ areaM2: number, lossCoeff: number }}
 */
export function referenciaPerdaBocal(componente, kBocal, areaCanoM2, sentido, { kEnergiaCinetica = 0 } = {}) {
    const k = Math.max(0, Number(kBocal) || 0);
    if (componente?.usarGeometriaBocal !== true) return { areaM2: areaCanoM2, lossCoeff: k };

    const areaBocalM2 = componente.getAreaConexaoM2();
    const kCinetico = Math.min(k, Math.max(0, kEnergiaCinetica));
    const [montante, jusante] = sentido === 'saida'
        ? [areaBocalM2, areaCanoM2]
        : [areaCanoM2, areaBocalM2];
    return {
        areaM2: areaBocalM2,
        lossCoeff: (k - kCinetico)
            + (kCinetico * ((areaBocalM2 / areaCanoM2) ** 2))
            + coeficienteTransicaoSecao(montante, jusante, areaBocalM2)
    };
}
