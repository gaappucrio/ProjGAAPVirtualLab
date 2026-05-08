// ===================================
// PRESENTATION: Validação de Entradas
// Arquivo: js/presentation/validation/InputValidator.js
// ===================================

import { translateLiteral } from '../../utils/LanguageManager.js';

export function parseStrictNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;

    const text = String(value ?? '').trim();
    if (!text) return NaN;

    const decimalText = text.includes(',') && !text.includes('.')
        ? text.replace(',', '.')
        : text;
    const validDecimal = /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:e[+-]?\d+)?$/i.test(decimalText);
    if (!validDecimal) return NaN;

    const number = Number(decimalText);
    return Number.isFinite(number) ? number : NaN;
}

/**
 * Validador centralizado para entradas editadas pelo usuário.
 */
export class InputValidator {
    constructor() {
        this.validationRules = new Map();
        this.errors = [];
    }

    /**
     * Valida valor numerico dentro de limites.
     */
    static validateNumber(value, min = -Infinity, max = Infinity, fieldName = 'valor') {
        const num = parseStrictNumber(value);
        const label = translateLiteral(fieldName);

        if (!Number.isFinite(num)) {
            return { valid: false, error: translateLiteral(`${label} deve ser um número válido`) };
        }

        if (num < min) {
            return { valid: false, error: translateLiteral(`${label} não pode ser menor que ${min}`) };
        }

        if (num > max) {
            return { valid: false, error: translateLiteral(`${label} não pode ser maior que ${max}`) };
        }

        return { valid: true, value: num };
    }

    /**
     * Valida vazão em litros por segundo.
     */
    static validateFlow(value, maxFlow = 500, fieldName = 'Vazão') {
        const result = this.validateNumber(value, 0, maxFlow, fieldName);
        if (!result.valid) return result;

        if (result.value > maxFlow) {
            return { valid: false, error: translateLiteral(`${translateLiteral(fieldName)} não pode exceder ${maxFlow} l/s`) };
        }

        return result;
    }

    /**
     * Valida pressão em bar.
     */
    static validatePressure(value, maxPressure = 100, fieldName = 'Pressão') {
        return this.validateNumber(value, 0, maxPressure, fieldName);
    }

    /**
     * Valida altura em metros.
     */
    static validateHeight(value, maxHeight = 100, fieldName = 'Altura') {
        return this.validateNumber(value, -maxHeight, maxHeight, fieldName);
    }

    /**
     * Valida volume em litros.
     */
    static validateVolume(value, maxVolume = 10000, fieldName = 'Volume') {
        return this.validateNumber(value, 0.1, maxVolume, fieldName);
    }

    /**
     * Valida abertura de válvula (0 a 100%).
     */
    static validateOpening(value, fieldName = 'Abertura') {
        return this.validateNumber(value, 0, 100, fieldName);
    }

    /**
     * Valida grau de acionamento (0 a 100%).
     */
    static validateDrive(value, fieldName = 'Comando de Acionamento') {
        return this.validateNumber(value, 0, 100, fieldName);
    }

    /**
     * Valida diametro em milimetros.
     */
    static validateDiameter(value, fieldName = 'Diâmetro') {
        const result = this.validateNumber(value, 1, 300, fieldName);
        if (!result.valid) return result;

        if (result.value < 1 || result.value > 300) {
            return { valid: false, error: translateLiteral(`${translateLiteral(fieldName)} deve estar entre 1mm e 300mm`) };
        }

        return result;
    }

    /**
     * Valida eficiencia (0 a 100%).
     */
    static validateEfficiency(value, fieldName = 'Eficiência') {
        return this.validateNumber(value, 0, 100, fieldName);
    }

    /**
     * Valida NPSH em metros.
     */
    static validateNPSH(value, fieldName = 'NPSH') {
        return this.validateNumber(value, 0, 50, fieldName);
    }

    /**
     * Valida viscosidade dinâmica em Pa.s.
     */
    static validateViscosity(value, fieldName = 'Viscosidade') {
        const result = this.validateNumber(value, 0.0001, 10, fieldName);
        if (!result.valid) return result;

        if (result.value <= 0) {
            return { valid: false, error: translateLiteral(`${translateLiteral(fieldName)} deve ser maior que 0`) };
        }

        return result;
    }

    /**
     * Valida densidade em kg/m3.
     */
    static validateDensity(value, fieldName = 'Densidade') {
        return this.validateNumber(value, 100, 2000, fieldName);
    }

    /**
     * Sanitiza entrada de texto removendo caracteres perigosos.
     */
    static sanitizeText(value, maxLength = 100) {
        return String(value)
            .trim()
            .substring(0, maxLength)
            .replace(/[<>]/g, '');
    }

    /**
     * Valida entrada com tratamento de erro automatico.
     */
    static validateAndAlert(value, validator, fieldName = 'Campo') {
        const result = validator(value, fieldName);

        if (!result.valid) {
            alert(translateLiteral(`Erro: ${result.error}`));
            return null;
        }

        return result.value;
    }

    /**
     * Cria validador customizado com min/max.
     */
    static createRangeValidator(min, max, fieldName = 'Valor') {
        return (value) => this.validateNumber(value, min, max, fieldName);
    }
}

/**
 * Decorator para validar inputs de eventos.
 */
export function validateInput(validator, fieldName = 'Campo') {
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = function(event) {
            const value = event.target.value;
            const result = validator(value, fieldName);

            if (!result.valid) {
                event.target.style.borderColor = '#e74c3c';
                event.target.title = result.error;
                console.warn(`Validação falhou para ${fieldName}: ${result.error}`);
                return undefined;
            }

            event.target.style.borderColor = '';
            event.target.title = '';
            return originalMethod.call(this, result.value);
        };
        return descriptor;
    };
}

/**
 * Mostra erro visual em campo de entrada.
 */
export function showInputError(inputElement, error) {
    inputElement.style.borderColor = '#e74c3c';
    inputElement.style.backgroundColor = '#fff0f0';
    inputElement.title = error;

    const timeout = setTimeout(() => {
        inputElement.style.borderColor = '';
        inputElement.style.backgroundColor = '';
    }, 3000);

    inputElement.addEventListener('input', () => {
        clearTimeout(timeout);
        inputElement.style.borderColor = '';
        inputElement.style.backgroundColor = '';
    }, { once: true });
}

/**
 * Limpa erro visual de campo de entrada.
 */
export function clearInputError(inputElement) {
    inputElement.style.borderColor = '';
    inputElement.style.backgroundColor = '';
    inputElement.title = '';
}
