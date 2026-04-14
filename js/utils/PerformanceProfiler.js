// ================================================
// UTILIDADE: Profiling de Desempenho da Simulação
// Arquivo: js/utils/PerformanceProfiler.js
// ================================================

/**
 * Profiler para monitorar e diagnosticar estrangulamentos e problemas numéricos
 */
export class PerformanceProfiler {
    constructor() {
        this.enabled = false; // Ativa/desativa profiling
        this.tickMetrics = [];
        this.currentTick = null;
        this.solverWarnings = [];
        this.maxStoredTicks = 100;
    }

    /**
     * Habilita o profiling de desempenho
     */
    enable() {
        this.enabled = true;
        console.log('[Profiler] Profiling de desempenho ATIVADO');
    }

    /**
     * Desabilita o profiling
     */
    disable() {
        this.enabled = false;
        console.log('[Profiler] Profiling de desempenho DESATIVADO');
    }

    /**
     * Inicia cronômetro para uma nova iteração da simulação
     */
    startTick() {
        if (!this.enabled) return;
        this.currentTick = {
            timestamp: performance.now(),
            elapsedMs: 0,
            solverIterations: 0,
            solverConverged: true,
            warnings: []
        };
    }

    /**
     * Finaliza cronômetro e registra métricas da iteração
     */
    endTick(solverMetrics = null) {
        if (!this.enabled || !this.currentTick) return;

        this.currentTick.elapsedMs = performance.now() - this.currentTick.timestamp;

        if (solverMetrics) {
            this.currentTick.solverIterations = solverMetrics.lastIterations;
            this.currentTick.solverConverged = solverMetrics.lastIterations < 512;
            
            if (solverMetrics.lastIterations === 512) {
                this.currentTick.warnings.push('Solver atingiu limite máximo de iterações');
            }
        }

        // Aviso se frame rate está baixo
        if (this.currentTick.elapsedMs > 16.67) {
            this.currentTick.warnings.push(`Frame lento: ${this.currentTick.elapsedMs.toFixed(2)}ms`);
        }

        this.tickMetrics.push(this.currentTick);
        
        // Mantém histórico limitado
        if (this.tickMetrics.length > this.maxStoredTicks) {
            this.tickMetrics.shift();
        }

        this.currentTick = null;
    }

    /**
     * Retorna estatísticas agregadas do profiling
     */
    getStats() {
        if (this.tickMetrics.length === 0) {
            return null;
        }

        const times = this.tickMetrics.map(t => t.elapsedMs);
        const iterations = this.tickMetrics.map(t => t.solverIterations);
        const convergedCount = this.tickMetrics.filter(t => t.solverConverged).length;

        return {
            frameCount: this.tickMetrics.length,
            avgFrameTimeMs: times.reduce((a, b) => a + b, 0) / times.length,
            maxFrameTimeMs: Math.max(...times),
            minFrameTimeMs: Math.min(...times),
            avgSolverIterations: iterations.reduce((a, b) => a + b, 0) / iterations.length,
            maxSolverIterations: Math.max(...iterations),
            convergenceRate: (convergedCount / this.tickMetrics.length) * 100,
            estimatedFps: 1000 / (times.reduce((a, b) => a + b, 0) / times.length),
            totalFramesAnalyzed: this.tickMetrics.length
        };
    }

    /**
     * Exibe relatório de desempenho no console
     */
    printReport() {
        const stats = this.getStats();
        if (!stats) {
            console.log('[Profiler] Nenhum dado disponível ainda');
            return;
        }

        console.group('[Profiler] Relatório de Desempenho');
        console.log(`📊 Frames Analisados: ${stats.totalFramesAnalyzed}`);
        console.log(`⏱️  Tempo médio por frame: ${stats.avgFrameTimeMs.toFixed(2)}ms`);
        console.log(`   - Mínimo: ${stats.minFrameTimeMs.toFixed(2)}ms`);
        console.log(`   - Máximo: ${stats.maxFrameTimeMs.toFixed(2)}ms`);
        console.log(`   - FPS estimado: ${stats.estimatedFps.toFixed(1)}`);
        console.log(`🔄 Iterações do Solver:`);
        console.log(`   - Média: ${stats.avgSolverIterations.toFixed(1)}`);
        console.log(`   - Máximo: ${stats.maxSolverIterations}`);
        console.log(`✅ Taxa de Convergência: ${stats.convergenceRate.toFixed(1)}%`);
        console.groupEnd();
    }

    /**
     * Retorna últimas N iterações com problemas
     */
    getProblematicFrames(count = 10) {
        return this.tickMetrics
            .slice(-count)
            .filter(t => t.warnings.length > 0 || !t.solverConverged)
            .map((t, i) => ({
                frame: this.tickMetrics.length - count + i,
                elapsedMs: t.elapsedMs,
                solverIterations: t.solverIterations,
                warnings: t.warnings
            }));
    }

    /**
     * Limpa histórico de profiling
     */
    reset() {
        this.tickMetrics = [];
        this.currentTick = null;
        console.log('[Profiler] Histórico resetado');
    }

    /**
     * Exporta dados do profiling como JSON
     */
    exportData() {
        return {
            stats: this.getStats(),
            tickMetrics: this.tickMetrics,
            problematicFrames: this.getProblematicFrames(this.tickMetrics.length)
        };
    }
}

// Instância global do profiler
export const profiler = new PerformanceProfiler();

// Função auxiliar para ativar debugging
export function enablePhysicsDebugging() {
    console.log('%c🔧 Modo de Debug Físico Ativado', 'color: orange; font-weight: bold; font-size: 14px');
    console.log('Dicas:');
    console.log('  profiler.enable()          - Ativa profiling de desempenho');
    console.log('  profiler.printReport()     - Exibe relatório');
    console.log('  profiler.getProblematicFrames() - Frames com problemas');
    console.log('  ENGINE.getSolverMetrics()  - Métricas do solver');
}
