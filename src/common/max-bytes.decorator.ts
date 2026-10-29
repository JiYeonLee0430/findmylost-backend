import { registerDecorator, ValidationOptions } from 'class-validator';

/** 문자열의 UTF-8 바이트 길이가 max 이하인지 검사 (bcrypt는 72바이트까지만 사용) */
export function MaxBytes(max: number, options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'maxBytes',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= max,
        defaultMessage: () => `${propertyName}은(는) ${max}바이트 이하여야 합니다. (한글은 글자당 3바이트)`,
      },
    });
  };
}