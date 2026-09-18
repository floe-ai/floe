import { Ajv } from "ajv";
/** One production JSON-Schema validator for discovery and invocation. */
export class AjvOperationSchemaValidator {
    ajv = new Ajv({ allErrors: true, strict: true });
    compiled = new WeakMap();
    validate(schema, value) {
        const validator = this.compiled.get(schema) ?? this.compile(schema);
        if (validator(value))
            return { valid: true };
        return {
            valid: false,
            issues: (validator.errors ?? []).map(toIssue),
        };
    }
    compile(schema) {
        const validator = this.ajv.compile(schema);
        this.compiled.set(schema, validator);
        return validator;
    }
}
function toIssue(error) {
    return {
        instance_path: error.instancePath,
        schema_path: error.schemaPath,
        keyword: error.keyword,
        message: error.message ?? "does not match the operation schema",
        params: error.params,
    };
}
