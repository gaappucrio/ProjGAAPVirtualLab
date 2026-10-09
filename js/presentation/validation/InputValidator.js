// ===================================
// PRESENTATION: Validação de Entradas
// Arquivo: js/presentation/validation/InputValidator.js
// ===================================

import { translateLiteral } from '../i18n/LanguageManager.js';

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
        return this.validateNumber(value, 0, maxFlow, fieldName);
    }

    /**
     * Valida pressão em bar.
     */
    static validatePressure(value, maxPressure = 100, fieldName = 'Pressão') {
        return this.validateNumber(value, 0, maxPressure, fieldName);
    }

    /**
     * Valida volume em litros.
     */
    static validateVolume(value, maxVolume = 10000, fieldName = 'Volume') {
        return this.validateNumber(value, 0.1, maxVolume, fieldName);
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
        return this.validateNumber(value, 0.0001, 10, fieldName);
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
