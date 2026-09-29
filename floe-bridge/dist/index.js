#!/usr/bin/env node
import { createRequire as __floeCreateRequire } from 'node:module'; const require = __floeCreateRequire(import.meta.url);
import {
  __export,
  __toESM,
  require_dist
} from "./chunk-5Y3WRL4X.js";

// floe-cli/dist/local-channel/protocol.js
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
var PROTOCOL_VERSION = 1;
var MAX_LINE_BYTES = 1024 * 1024;
function canonicalHome(home) {
  const absolute = resolve(home);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}
function channelAddress(spec, home) {
  if (process.platform === "win32") {
    const digest2 = createHash("sha256").update(canonicalHome(home)).digest("hex").slice(0, 24);
    return `\\\\.\\pipe\\floe-${spec.name}-${digest2}`;
  }
  return join(home, "run", spec.socketFile);
}
function runDir(home) {
  return join(home, "run");
}
function channelRunFilePath(spec, home) {
  return join(runDir(home), spec.runFile);
}
function newChannelSecret() {
  return randomBytes(32).toString("hex");
}
function ensureRunDir(home) {
  const dir = runDir(home);
  mkdirSync(dir, { recursive: true });
  try {
    chmodSync(dir, 448);
  } catch {
  }
}
function writeChannelRunFile(spec, home, run) {
  ensureRunDir(home);
  const path2 = channelRunFilePath(spec, home);
  const temporary = `${path2}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(run, null, 2) + "\n", { encoding: "utf8", mode: 384 });
  renameSync(temporary, path2);
}
function readChannelRunFile(spec, home) {
  const path2 = channelRunFilePath(spec, home);
  if (!existsSync(path2))
    return null;
  try {
    const value = JSON.parse(readFileSync(path2, "utf8"));
    if (typeof value.secret !== "string" || typeof value.address !== "string" || typeof value.pid !== "number")
      return null;
    return value;
  } catch {
    return null;
  }
}
function newNonce() {
  return randomBytes(16).toString("hex");
}
function channelProof(spec, secret, role, nonce) {
  return createHmac("sha256", Buffer.from(secret, "hex")).update(`floe-${spec.name}:${role}:${nonce}`).digest("hex");
}
function proofMatches(expected, received) {
  if (typeof received !== "string" || received.length !== expected.length)
    return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}
function lineReader(onMessage, onError) {
  let buffer = "";
  return (chunk) => {
    buffer += chunk.toString();
    if (Buffer.byteLength(buffer) > MAX_LINE_BYTES && !buffer.includes("\n")) {
      buffer = "";
      onError("message too large");
      return;
    }
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line)
        continue;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        onError("invalid JSON");
        return;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        onError("message is not an object");
        return;
      }
      onMessage(parsed);
    }
  };
}
function frame(message) {
  return JSON.stringify(message) + "\n";
}

// floe-cli/dist/local-channel/server.js
import { createConnection, createServer } from "node:net";
import { rmSync, unlinkSync } from "node:fs";
var HANDSHAKE_TIMEOUT_MS = 5e3;
var ChannelAddressInUseError = class extends Error {
  address;
  constructor(address, label = "A Floe service") {
    super(`${label} is already serving this Floe home at ${address}.`);
    this.address = address;
    this.name = "ChannelAddressInUseError";
  }
};
async function serveChannel(spec, service, options) {
  const log = options.log ?? (() => {
  });
  const address = channelAddress(spec, options.home);
  const secret = options.secret ?? newChannelSecret();
  const sockets = /* @__PURE__ */ new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    handleConnection(spec, service, socket, secret, log);
  });
  ensureRunDir(options.home);
  await listen(server, address, spec.label);
  writeChannelRunFile(spec, options.home, {
    protocol: PROTOCOL_VERSION,
    pid: process.pid,
    version: service.version,
    address,
    secret,
    started_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  log(`listening at ${address}`);
  return {
    address,
    close: () => new Promise((resolve6) => {
      const run = readChannelRunFile(spec, options.home);
      if (run && run.pid === process.pid)
        rmSync(channelRunFilePath(spec, options.home), { force: true });
      for (const socket of sockets)
        socket.destroy();
      server.close(() => resolve6());
    })
  };
}
async function listen(server, address, label) {
  try {
    await listenOnce(server, address);
  } catch (error) {
    if (error.code !== "EADDRINUSE")
      throw error;
    if (process.platform !== "win32" && !await answers(address)) {
      unlinkSync(address);
      await listenOnce(server, address);
      return;
    }
    throw new ChannelAddressInUseError(address, label);
  }
}
function listenOnce(server, address) {
  return new Promise((resolve6, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve6();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(address);
  });
}
function answers(address) {
  return new Promise((resolve6) => {
    const probe = createConnection(address);
    probe.once("connect", () => {
      probe.destroy();
      resolve6(true);
    });
    probe.once("error", () => resolve6(false));
  });
}
var ChannelError = class extends Error {
  code;
  details;
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "ChannelError";
  }
};
function refusalOf(error) {
  if (error instanceof ChannelError)
    return error;
  return new ChannelError("failed", error instanceof Error ? error.message : String(error));
}
function handleConnection(spec, service, socket, secret, log) {
  let stage = "hello";
  let serverNonce = "";
  let probe = false;
  let peer = null;
  const send = (message) => {
    if (!socket.destroyed)
      socket.write(frame(message));
  };
  const refuse = (reason) => {
    log(`refused a connection: ${reason}`);
    send({ type: "error", error: { code: "handshake_failed", message: reason } });
    socket.end();
    socket.destroySoon?.();
  };
  const timer = setTimeout(() => refuse("handshake timed out"), HANDSHAKE_TIMEOUT_MS);
  socket.on("data", lineReader((message) => {
    if (stage === "hello") {
      if (message.type !== "hello" || message.protocol !== PROTOCOL_VERSION || typeof message.client_nonce !== "string") {
        refuse(`expected hello for protocol ${PROTOCOL_VERSION}`);
        return;
      }
      serverNonce = newNonce();
      const surface = typeof message.surface === "string" && message.surface.trim() ? message.surface.trim().slice(0, 100) : "unnamed surface";
      peer = { surface, send };
      probe = message.probe === true;
      stage = "prove";
      send({
        type: "challenge",
        protocol: PROTOCOL_VERSION,
        server_nonce: serverNonce,
        server_proof: channelProof(spec, secret, "agent", message.client_nonce),
        agent_version: service.version
      });
      return;
    }
    if (stage === "prove") {
      if (message.type !== "prove" || !proofMatches(channelProof(spec, secret, "client", serverNonce), message.client_proof)) {
        refuse("the client could not prove it runs as this user");
        return;
      }
      clearTimeout(timer);
      if (probe) {
        send({ type: "welcome", state: service.state(), agent_version: service.version });
        socket.end();
        return;
      }
      stage = "ready";
      service.attach(peer);
      send({ type: "welcome", state: service.state(), agent_version: service.version });
      return;
    }
    if (message.type !== "request" || typeof message.op !== "string") {
      send({ type: "error", error: { code: "invalid_request", message: "Expected {type:'request', id, op, args}." } });
      return;
    }
    const id2 = message.id;
    const args = message.args && typeof message.args === "object" && !Array.isArray(message.args) ? message.args : {};
    service.handle(peer, message.op, args).then((result2) => send({ type: "response", id: id2, ok: true, result: result2 }), (error) => {
      const refusal = refusalOf(error);
      send({ type: "response", id: id2, ok: false, error: { code: refusal.code, message: refusal.message, ...refusal.details } });
    });
  }, (reason) => refuse(reason)));
  socket.on("error", () => {
  });
  socket.on("close", () => {
    clearTimeout(timer);
    if (stage === "ready" && peer)
      service.detach(peer);
  });
}

// floe-cli/dist/engines/protocol.js
var ENGINES_CHANNEL = {
  name: "engines",
  label: "Floe's engine control",
  runFile: "engines.json",
  socketFile: "engines.sock"
};

// floe-bridge/dist/config.js
var import_yaml = __toESM(require_dist(), 1);
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname, isAbsolute, join as join2, resolve as resolve2 } from "node:path";
import { homedir } from "node:os";

// node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;

// node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}

// node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path: path2, errorMaps, issueData } = params;
  const fullPath = [...path2, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

// node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path2, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path2;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result2) => {
  if (isValid(result2)) {
    return { success: true, data: result2.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result2 = this._parse(input);
    if (isAsync(result2)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result2;
  }
  _parseAsync(input) {
    const result2 = this._parse(input);
    return Promise.resolve(result2);
  }
  parse(data, params) {
    const result2 = this.safeParse(data, params);
    if (result2.success)
      return result2.data;
    throw result2.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result2 = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result2);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result2 = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result2) ? {
          value: result2.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result2) => isValid(result2) ? {
      value: result2.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result2 = await this.safeParseAsync(data, params);
    if (result2.success)
      return result2.data;
    throw result2.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result2 = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result2);
  }
  refine(check3, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result2 = check3(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result2 instanceof Promise) {
        return result2.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result2) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check3, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check3(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check3 of this._def.checks) {
      if (check3.kind === "min") {
        if (input.data.length < check3.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check3.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "max") {
        if (input.data.length > check3.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check3.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "length") {
        const tooBig = input.data.length > check3.value;
        const tooSmall = input.data.length < check3.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check3.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check3.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check3.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check3.message
            });
          }
          status.dirty();
        }
      } else if (check3.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "regex") {
        check3.regex.lastIndex = 0;
        const testResult = check3.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "trim") {
        input.data = input.data.trim();
      } else if (check3.kind === "includes") {
        if (!input.data.includes(check3.value, check3.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check3.value, position: check3.position },
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check3.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check3.kind === "startsWith") {
        if (!input.data.startsWith(check3.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check3.value },
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "endsWith") {
        if (!input.data.endsWith(check3.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check3.value },
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "datetime") {
        const regex = datetimeRegex(check3);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "time") {
        const regex = timeRegex(check3);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "ip") {
        if (!isValidIP(input.data, check3.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "jwt") {
        if (!isValidJWT(input.data, check3.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "cidr") {
        if (!isValidCidr(input.data, check3.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check3.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check3);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check3) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check3]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check3 of this._def.checks) {
      if (check3.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "min") {
        const tooSmall = check3.inclusive ? input.data < check3.value : input.data <= check3.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check3.value,
            type: "number",
            inclusive: check3.inclusive,
            exact: false,
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "max") {
        const tooBig = check3.inclusive ? input.data > check3.value : input.data >= check3.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check3.value,
            type: "number",
            inclusive: check3.inclusive,
            exact: false,
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check3.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check3.value,
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check3.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check3);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check3) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check3]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check3 of this._def.checks) {
      if (check3.kind === "min") {
        const tooSmall = check3.inclusive ? input.data < check3.value : input.data <= check3.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check3.value,
            inclusive: check3.inclusive,
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "max") {
        const tooBig = check3.inclusive ? input.data > check3.value : input.data >= check3.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check3.value,
            inclusive: check3.inclusive,
            message: check3.message
          });
          status.dirty();
        }
      } else if (check3.kind === "multipleOf") {
        if (input.data % check3.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check3.value,
            message: check3.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check3);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check3) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check3]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check3 of this._def.checks) {
      if (check3.kind === "min") {
        if (input.data.getTime() < check3.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check3.message,
            inclusive: true,
            exact: false,
            minimum: check3.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check3.kind === "max") {
        if (input.data.getTime() > check3.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check3.message,
            inclusive: true,
            exact: false,
            maximum: check3.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check3);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check3) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check3]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result3) => {
        return ParseStatus.mergeArray(status, result3);
      });
    }
    const result2 = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result2);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result2 of results) {
        if (result2.result.status === "valid") {
          return result2.result;
        }
      }
      for (const result2 of results) {
        if (result2.result.status === "dirty") {
          ctx.common.issues.push(...result2.ctx.common.issues);
          return result2.result;
        }
      }
      const unionErrors = results.map((result2) => new ZodError(result2.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result2 = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result2.status === "valid") {
          return result2;
        } else if (result2.status === "dirty" && !dirty) {
          dirty = { result: result2, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result2 = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result2, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result2, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result2 = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result2, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result2, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result2 = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result2.status === "aborted")
            return INVALID;
          if (result2.status === "dirty")
            return DIRTY(result2.value);
          if (status.value === "dirty")
            return DIRTY(result2.value);
          return result2;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result2 = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result2.status === "aborted")
          return INVALID;
        if (result2.status === "dirty")
          return DIRTY(result2.value);
        if (status.value === "dirty")
          return DIRTY(result2.value);
        return result2;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result2 = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result2);
        }
        if (result2 instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result2 = effect.transform(base.value, checkCtx);
        if (result2 instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result2 };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result2) => ({
            status: status.value,
            value: result2
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result2 = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result2)) {
      return result2.then((result3) => {
        return {
          status: "valid",
          value: result3.status === "valid" ? result3.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result2.status === "valid" ? result2.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = /* @__PURE__ */ Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result2 = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result2) ? result2.then((data) => freeze(data)) : freeze(result2);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check3, _params = {}, fatal) {
  if (check3)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check3(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: ((arg) => ZodString.create({ ...arg, coerce: true })),
  number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
  boolean: ((arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  })),
  bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
  date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
};
var NEVER = INVALID;

// floe-bridge/dist/config.js
var LocalConfigSchema = external_exports.object({
  schema: external_exports.literal("floe.local.v1"),
  version: external_exports.number().int(),
  home: external_exports.string(),
  services: external_exports.object({
    start_on_demand: external_exports.boolean(),
    manager: external_exports.string()
  }),
  bus: external_exports.object({
    listen: external_exports.string(),
    http_base_url: external_exports.string(),
    ws_base_url: external_exports.string(),
    data_dir: external_exports.string(),
    log_dir: external_exports.string()
  }),
  bridge: external_exports.object({
    data_dir: external_exports.string(),
    log_dir: external_exports.string(),
    bus_url: external_exports.string(),
    runtime_adapter: external_exports.string().optional(),
    workspace_access: external_exports.object({
      local_paths: external_exports.boolean()
    })
  }),
  library: external_exports.object({
    configs_dir: external_exports.string(),
    skills_dir: external_exports.string(),
    extensions_dir: external_exports.string(),
    mcp_dir: external_exports.string(),
    templates_dir: external_exports.string()
  }),
  runtime: external_exports.object({
    default_auth_profile: external_exports.string().optional()
  }).optional()
});
function defaultConfig(home = join2(homedir(), ".floe")) {
  return {
    schema: "floe.local.v1",
    version: 1,
    home,
    services: { start_on_demand: true, manager: "auto" },
    bus: {
      listen: "127.0.0.1:5377",
      http_base_url: "http://127.0.0.1:5377",
      ws_base_url: "ws://127.0.0.1:5377",
      data_dir: "./bus",
      log_dir: "./logs/bus"
    },
    bridge: {
      data_dir: "./bridge",
      log_dir: "./logs/bridge",
      bus_url: "ws://127.0.0.1:5377",
      workspace_access: { local_paths: true }
    },
    library: {
      configs_dir: "./configs",
      skills_dir: "./skills",
      extensions_dir: "./extensions",
      mcp_dir: "./mcp",
      templates_dir: "./templates"
    }
  };
}
function expandHome(pathValue) {
  if (pathValue === "~")
    return homedir();
  if (pathValue.startsWith("~/") || pathValue.startsWith("~\\"))
    return join2(homedir(), pathValue.slice(2));
  return pathValue;
}
function resolveConfigPath(explicitPath) {
  return resolve2(expandHome(explicitPath ?? join2(homedir(), ".floe", "config.yaml")));
}
function resolveLocalPath(configPath, home, pathValue) {
  const expanded = expandHome(pathValue);
  if (isAbsolute(expanded))
    return resolve2(expanded);
  return resolve2(home ? expandHome(home) : dirname(configPath), expanded);
}
function rejectRetiredKeys(raw, configPath) {
  const services = raw?.services;
  if (services && Object.prototype.hasOwnProperty.call(services, "autostart")) {
    throw new Error(`Floe config at ${configPath} uses the retired key \`services.autostart\`.
It carried two different meanings and was split into two independent settings:
  - \`services.start_on_demand\` (config, default true): may a client start the
    substrate when it is unreachable.
  - start-at-login: no longer a config key \u2014 Floe reads it from the OS. Manage it
    with \`floe service install\` / \`floe service uninstall\`.
Remove \`services.autostart\`; to disable on-demand start set \`services.start_on_demand: false\`.
Then re-run setup:
  floe setup`);
  }
}
function parseLocalConfig(raw, configPath) {
  rejectRetiredKeys(raw, configPath);
  const result2 = LocalConfigSchema.safeParse(raw);
  if (result2.success)
    return result2.data;
  const details = result2.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
  throw new Error(`Floe config at ${configPath} is incompatible with this version of Floe.
Floe is in early development, so breaking config changes are expected and there is no automatic migration.
Reset your local config and re-run setup:
  rm -rf ~/.floe            # or: rm ${configPath}
  floe setup
Details: ${details}`);
}
function ensureConfig(explicitPath) {
  const configPath = resolveConfigPath(explicitPath);
  if (!existsSync2(configPath)) {
    const config2 = defaultConfig(join2(homedir(), ".floe"));
    mkdirSync2(dirname(configPath), { recursive: true });
    writeFileSync2(configPath, import_yaml.default.stringify(config2), "utf8");
  }
  const raw = import_yaml.default.parse(readFileSync2(configPath, "utf8"));
  const config = parseLocalConfig(raw, configPath);
  mkdirSync2(resolveLocalPath(configPath, config.home, config.bridge.data_dir), { recursive: true });
  mkdirSync2(resolveLocalPath(configPath, config.home, config.bridge.log_dir), { recursive: true });
  return { configPath, config };
}
function bridgeHttpBase(config) {
  if (config.bus.http_base_url)
    return config.bus.http_base_url;
  return config.bridge.bus_url.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
}
function bridgeWsBase(config) {
  if (config.bus.ws_base_url)
    return config.bus.ws_base_url;
  return config.bridge.bus_url;
}

// floe-bridge/dist/daemon.js
import { existsSync as existsSync8 } from "node:fs";
import { isAbsolute as isAbsolute4, relative as relative3, resolve as resolve5 } from "node:path";

// floe-bridge/dist/auth.js
var RuntimeAuthError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "RuntimeAuthError";
  }
};

// floe-bridge/dist/bus-client.js
function normalizeEventEnvelopeAtTransport(value) {
  const ids = value.artefact_version_ids;
  if (ids !== void 0 && (!Array.isArray(ids) || ids.some((id2) => typeof id2 !== "string" || !id2.trim()))) {
    throw new Error("The Bus returned an invalid Event artefact_version_ids contract.");
  }
  return {
    ...value,
    artefact_version_ids: ids === void 0 ? [] : [...ids]
  };
}
function normalizeDeliveryBundleAtTransport(bundle) {
  return {
    ...bundle,
    events: (bundle.events ?? []).map(normalizeEventEnvelopeAtTransport)
  };
}
var BridgeTransportUnavailableError = class extends Error {
  reason;
  code = "bridge_transport_unavailable";
  constructor(reason) {
    super(reason === "credential_missing" ? "The Bridge service credential is unavailable." : reason === "credential_not_accepted" ? "The Bridge service credential was not accepted." : "The Bridge service credential cannot be sent over an insecure transport.");
    this.reason = reason;
    this.name = "BridgeTransportUnavailableError";
  }
};
var BusClient = class {
  baseUrl;
  #authorityStateValue;
  #bearerToken;
  constructor(baseUrl, authority) {
    this.baseUrl = baseUrl;
    const token = authority?.audience === "bridge_service" ? authority.bearer_token.trim() : "";
    const secureTransport = isCredentialTransportSecure(baseUrl);
    this.#bearerToken = secureTransport ? token || null : null;
    this.#authorityStateValue = !secureTransport ? { status: "unavailable", reason: "insecure_transport" } : this.#bearerToken ? { status: "available", audience: "bridge_service" } : { status: "unavailable", reason: "credential_missing" };
  }
  get authorityState() {
    return this.#authorityStateValue;
  }
  requireAuthority() {
    if (this.#authorityStateValue.status === "unavailable") {
      throw new BridgeTransportUnavailableError(this.#authorityStateValue.reason);
    }
  }
  markAuthorityUnavailable(reason) {
    this.#bearerToken = null;
    this.#authorityStateValue = { status: "unavailable", reason };
  }
  async health() {
    const path2 = "/health";
    const response = await fetch(`${this.baseUrl}${path2}`);
    if (!response.ok)
      throw new Error(`GET ${path2} failed: ${response.status} ${await response.text()}`);
    return response.json();
  }
  async registerBridge(capabilities) {
    await this.post("/v1/bridges/register", { capabilities });
  }
  async reportBridgeLiveness() {
    await this.post("/v1/bridges/liveness", {});
  }
  async listWorkspaces() {
    const result2 = await this.get("/v1/bridge/workspace-bindings");
    return result2.workspaces;
  }
  async discoverOperations(workspaceId, operationAuthorityBearer, input = {}) {
    const params = new URLSearchParams();
    if (input.query)
      params.set("query", input.query);
    if (input.category)
      params.set("category", input.category);
    if (input.target) {
      params.set("target_kind", input.target.kind);
      params.set("target_id", input.target.id);
    }
    const suffix = params.size > 0 ? `?${params}` : "";
    return this.getWithBearer(`/v1/workspaces/${encodeURIComponent(workspaceId)}/operations${suffix}`, operationAuthorityBearer);
  }
  /** The same authenticated, digest-checked exact-content read used by clients. */
  async readArtefactVersionContent(workspaceId, versionId, bearerToken) {
    const maximumBytes = 20 * 1024 * 1024;
    const path2 = `/v1/workspaces/${encodeURIComponent(workspaceId)}/artefact-versions/${encodeURIComponent(versionId)}/content`;
    const response = await fetch(`${this.baseUrl}${path2}`, {
      headers: this.operationAuthorityHeaders(bearerToken),
      redirect: "error"
    });
    if (!response.ok)
      throw new Error(`Artefact content read failed: ${response.status} ${await response.text()}`);
    if (response.headers.get("x-floe-artefact-version-id") !== versionId) {
      await response.body?.cancel();
      throw new Error("The content response did not identify the requested ArtefactVersion.");
    }
    if (Number(response.headers.get("content-length")) > maximumBytes) {
      await response.body?.cancel();
      throw new Error("Artefact content exceeds the 20MB model-input limit.");
    }
    const reader = response.body?.getReader();
    if (!reader)
      throw new Error("The ArtefactVersion has no readable content.");
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done)
          break;
        size += next.value.byteLength;
        if (size > maximumBytes) {
          await reader.cancel();
          throw new Error("Artefact content exceeds the 20MB model-input limit.");
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    return {
      bytes: Buffer.concat(chunks),
      media_type: (response.headers.get("content-type") ?? "application/octet-stream").split(";", 1)[0].trim().toLowerCase()
    };
  }
  async invokeOperation(workspaceId, operationAuthorityBearer, request) {
    return this.postWithBearer(`/v1/workspaces/${encodeURIComponent(workspaceId)}/operations/invoke`, request, operationAuthorityBearer);
  }
  async listConfigs() {
    const result2 = await this.get("/v1/configs");
    return result2.configs;
  }
  async listEndpoints(workspaceId) {
    const result2 = await this.get(`/v1/workspaces/${encodeURIComponent(workspaceId)}/endpoints`);
    return result2.endpoints;
  }
  async listRuntimeEndpoints(workspaceId, bindingId) {
    const result2 = await this.get(`/v1/bridge/workspaces/${encodeURIComponent(workspaceId)}/runtime-endpoints?binding_id=${encodeURIComponent(bindingId)}`);
    return result2.endpoints;
  }
  /**
   * Fetch a context by id. Returns null when the bus reports 404. Throws on other non-2xx
   * responses or network errors — callers are expected to catch and degrade gracefully
   * (the bridge falls back to an empty participants list and logs a warning).
   */
  async getContext(contextId) {
    const path2 = `/v1/contexts/${encodeURIComponent(contextId)}`;
    const response = await fetch(`${this.baseUrl}${path2}`, { headers: this.authorizedHeaders() });
    if (response.status === 404)
      return null;
    if (!response.ok)
      throw await this.responseError("GET", path2, response);
    return response.json();
  }
  async registerEndpoint(input) {
    await this.post("/v1/endpoints/register", input);
  }
  async updateEndpointStatus(endpointId, status) {
    await this.post(`/v1/endpoints/${encodeURIComponent(endpointId)}/status`, { status });
  }
  async retireEndpoint(endpointId) {
    return this.post(`/v1/endpoints/${encodeURIComponent(endpointId)}/retire`, {});
  }
  async reportAttachment(workspaceId, input) {
    await this.post(`/v1/workspaces/${encodeURIComponent(workspaceId)}/attachment-result`, input);
  }
  async importWorkspaceConfiguration(workspaceId, inventory) {
    return this.post(`/v1/workspaces/${encodeURIComponent(workspaceId)}/import-config`, inventory);
  }
  async claimDeliveries() {
    const result2 = await this.get("/v1/delivery/claim?limit=10");
    return (result2.deliveries ?? []).map(normalizeDeliveryBundleAtTransport);
  }
  async reportDeliveryStatus(deliveryId, state, error) {
    const result2 = await this.post(`/v1/delivery/${encodeURIComponent(deliveryId)}/status`, {
      state,
      error: error ?? null
    });
    return result2.delivery;
  }
  async prepareRuntimeDelivery(deliveryId) {
    return this.post(`/v1/delivery/${encodeURIComponent(deliveryId)}/runtime-prepare`, {});
  }
  async readRuntimeCredential(deliveryId, secretRefId) {
    const path2 = `/v1/delivery/${encodeURIComponent(deliveryId)}/runtime-credentials/${encodeURIComponent(secretRefId)}`;
    const response = await fetch(`${this.baseUrl}${path2}`, {
      headers: this.authorizedHeaders({ accept: "application/octet-stream" }),
      cache: "no-store"
    });
    if (!response.ok)
      throw await this.responseError("GET", path2, response);
    const length = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > 1024 * 1024) {
      throw new Error("The runtime credential response exceeded its bounded transport contract.");
    }
    const material = new Uint8Array(await response.arrayBuffer());
    if (material.byteLength === 0 || material.byteLength > 1024 * 1024) {
      material.fill(0);
      throw new Error("The runtime credential response was invalid.");
    }
    return material;
  }
  async replaceRuntimeCredential(deliveryId, secretRefId, material) {
    if (!(material instanceof Uint8Array) || material.byteLength === 0 || material.byteLength > 1024 * 1024) {
      throw new Error("The refreshed runtime credential is invalid.");
    }
    const path2 = `/v1/delivery/${encodeURIComponent(deliveryId)}/runtime-credentials/${encodeURIComponent(secretRefId)}`;
    const body = material.buffer.slice(material.byteOffset, material.byteOffset + material.byteLength);
    const response = await fetch(`${this.baseUrl}${path2}`, {
      method: "PUT",
      headers: this.authorizedHeaders({ "content-type": "application/octet-stream" }),
      body
    });
    if (!response.ok)
      throw await this.responseError("PUT", path2, response);
  }
  async emit(event) {
    return this.post("/v1/events/emit", event);
  }
  async reportTurnEnd(endpointId) {
    await this.post(`/v1/endpoints/${encodeURIComponent(endpointId)}/turn-end`, {});
  }
  async appendRuntimeTelemetry(input) {
    await this.post("/v1/runtime/telemetry", input);
  }
  async recordRuntimeTurnResult(input) {
    const result2 = await this.post("/v1/runtime/turn-result", input);
    return {
      ...result2,
      result_event: normalizeEventEnvelopeAtTransport(result2.result_event),
      return_event: result2.return_event ? normalizeEventEnvelopeAtTransport(result2.return_event) : null
    };
  }
  async resolveRuntimeBinding(workspaceId, endpointId) {
    return this.get(`/v1/runtime/bindings/resolve?workspace_id=${encodeURIComponent(workspaceId)}&endpoint_id=${encodeURIComponent(endpointId)}`);
  }
  async createPulse(input) {
    return this.post("/v1/pulses", input);
  }
  async listPulses(filters) {
    const params = new URLSearchParams();
    if (filters.workspace_id)
      params.set("workspace_id", filters.workspace_id);
    if (filters.status)
      params.set("status", filters.status);
    if (filters.scope_id)
      params.set("scope_id", filters.scope_id);
    return this.get(`/v1/pulses?${params}`);
  }
  async pausePulse(pulseId) {
    return this.post(`/v1/pulses/${encodeURIComponent(pulseId)}/pause`, {});
  }
  async resumePulse(pulseId) {
    return this.post(`/v1/pulses/${encodeURIComponent(pulseId)}/resume`, {});
  }
  async cancelPulse(pulseId) {
    return this.post(`/v1/pulses/${encodeURIComponent(pulseId)}/cancel`, {});
  }
  /** Retained legacy graphs used for remaining Event-source and Actor instruction bindings. */
  async listScopeGraphsForWorkspace(workspaceId) {
    return this.get(`/v1/workspaces/${encodeURIComponent(workspaceId)}/graphs`);
  }
  /**
   * Fires an existing Scope Graph trigger node — no new wake mechanism, just
   * the same `fireScopeGraphTrigger` emit path a manual trigger fire would
   * use. A world-facing doorway (e.g. a watched folder) passes arrival facts
   * (channel, locator, observed_at, raw_reference) as ordinary `content` —
   * there is no separate origin envelope; the shape of `content` is exactly
   * what the receiving node's own config decides to make of it.
   */
  async fireScopeGraphTriggerNode(workspaceId, graphId, nodeId, input = {}) {
    const result2 = await this.post(`/v1/workspaces/${encodeURIComponent(workspaceId)}/graphs/${encodeURIComponent(graphId)}/nodes/${encodeURIComponent(nodeId)}/fire`, input);
    return { events: (result2.events ?? []).map(normalizeEventEnvelopeAtTransport) };
  }
  async requestConfigSnapshot(workspaceId) {
    return this.post(`/v1/workspaces/${encodeURIComponent(workspaceId)}/config-snapshot`, {});
  }
  /**
   * Create a new context in the bus.
   * Supports optional scope_id (for card-as-context) and title.
   */
  async createContext(input) {
    const result2 = await this.post(`/v1/workspaces/${encodeURIComponent(input.workspace_id)}/contexts`, {
      participants: input.participants ?? [],
      scope_id: input.scope_id ?? null,
      created_by_endpoint_id: input.created_by_endpoint_id ?? null,
      title: input.title ?? null,
      parent_context_id: input.parent_context_id ?? null
    });
    return result2.context.context_id;
  }
  /**
   * List all contexts for a specific scope in a workspace.
   * Uses the server-side indexed query (idx_contexts_workspace_scope).
   */
  async listContextsForScope(workspaceId, scopeId) {
    const url = `/v1/workspaces/${encodeURIComponent(workspaceId)}/contexts?scope_id=${encodeURIComponent(scopeId)}`;
    const result2 = await this.get(url);
    return result2.contexts;
  }
  /**
   * Add an endpoint as a participant in a context (idempotent).
   * Returns whether the participant was newly added.
   */
  async addParticipant(contextId, endpointId) {
    const result2 = await this.post(`/v1/contexts/${encodeURIComponent(contextId)}/participants`, { endpoint_id: endpointId });
    return { added: result2.added };
  }
  /**
   * Remove an endpoint from a context's participant list (idempotent).
   * Returns whether the participant was removed.
   */
  async removeParticipant(contextId, endpointId) {
    const result2 = await this._delete(`/v1/contexts/${encodeURIComponent(contextId)}/participants/${encodeURIComponent(endpointId)}`);
    return { removed: result2.removed };
  }
  /**
   * Subscribe an endpoint to event types in a context (UPSERT, idempotent).
   * eventTypes defaults to ["*"] (all events).
   * Pass [] to create a silent watcher — still a participant, never woken.
   */
  async subscribeToContext(contextId, endpointId, eventTypes = ["*"]) {
    await this.post(`/v1/contexts/${encodeURIComponent(contextId)}/subscriptions`, { endpoint_id: endpointId, event_types: eventTypes });
  }
  /**
   * Remove an endpoint's subscription from a context entirely.
   * Does NOT remove the endpoint from participants.
   */
  async unsubscribeFromContext(contextId, endpointId) {
    await this._delete(`/v1/contexts/${encodeURIComponent(contextId)}/subscriptions/${encodeURIComponent(endpointId)}`);
  }
  /**
   * Batch-apply participant + subscription changes in one atomic call.
   *
   * - `entries`: each endpoint is added as a participant AND gets its subscription
   *   upserted with the given `event_types`. Pass `[]` to create a silent watcher.
   * - `participantsOnly`: endpoints added as participants with no subscription change.
   *
   * Maps to `POST /v1/contexts/:id/subscriptions:batch`.
   */
  async applyContextSubscriptions(contextId, entries, participantsOnly = []) {
    await this.post(`/v1/contexts/${encodeURIComponent(contextId)}/subscriptions:batch`, { entries, participants_only: participantsOnly });
  }
  /**
   * List all subscriptions for a context.
   */
  async listContextSubscriptions(contextId) {
    const result2 = await this.get(`/v1/contexts/${encodeURIComponent(contextId)}/subscriptions`);
    return result2.subscriptions;
  }
  /**
   * List events for a context in either direction from an optional cursor.
   * Returns a chronological page and the Bus cursor for that direction. Runtime actors use
   * this deliberately through the Context-history tool; it is not prompt injection.
   */
  async listContextEvents(contextId, cursor, limit, direction = "forward") {
    const params = new URLSearchParams({ context_id: contextId, direction });
    if (cursor)
      params.set(direction === "backward" ? "before" : "since", cursor);
    if (limit != null)
      params.set("limit", String(limit));
    const result2 = await this.get(`/v1/events?${params}`);
    return {
      events: (result2.events ?? []).map(normalizeEventEnvelopeAtTransport),
      next_cursor: (direction === "backward" ? result2.previous_cursor : result2.next_cursor) ?? null
    };
  }
  /**
   * List child contexts whose parent_context_id equals contextId.
   * Used for epic→card links.
   */
  async listChildContexts(contextId) {
    const result2 = await this.get(`/v1/contexts/${encodeURIComponent(contextId)}/children`);
    return result2.contexts;
  }
  // ---------------------------------------------------------------------------
  async _delete(path2) {
    const response = await fetch(`${this.baseUrl}${path2}`, {
      method: "DELETE",
      headers: this.authorizedHeaders()
    });
    if (!response.ok)
      throw await this.responseError("DELETE", path2, response);
    return response.json();
  }
  async get(path2) {
    const response = await fetch(`${this.baseUrl}${path2}`, { headers: this.authorizedHeaders() });
    if (!response.ok)
      throw await this.responseError("GET", path2, response);
    return response.json();
  }
  async post(path2, body) {
    const response = await fetch(`${this.baseUrl}${path2}`, {
      method: "POST",
      headers: this.authorizedHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(body)
    });
    if (!response.ok)
      throw await this.responseError("POST", path2, response);
    return response.json();
  }
  async getWithBearer(path2, bearerToken) {
    const response = await fetch(`${this.baseUrl}${path2}`, {
      headers: this.operationAuthorityHeaders(bearerToken)
    });
    if (!response.ok) {
      throw new Error(`GET ${path2} failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
  }
  async postWithBearer(path2, body, bearerToken) {
    const response = await fetch(`${this.baseUrl}${path2}`, {
      method: "POST",
      headers: this.operationAuthorityHeaders(bearerToken, { "content-type": "application/json" }),
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`POST ${path2} failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
  }
  operationAuthorityHeaders(bearerToken, additional = {}) {
    const token = bearerToken.trim();
    if (!token)
      throw new Error("The active Delivery has no operation authority session.");
    if (!isCredentialTransportSecure(this.baseUrl)) {
      throw new Error("Operation authority cannot cross an insecure transport.");
    }
    return {
      ...additional,
      authorization: `Bearer ${token}`
    };
  }
  authorizedHeaders(additional = {}) {
    this.requireAuthority();
    return {
      ...additional,
      authorization: `Bearer ${this.#bearerToken}`
    };
  }
  async responseError(method, path2, response) {
    if (response.status === 401) {
      const bridgeReadPath = "/v1/bridge/workspace-bindings";
      let bridgeRejected = path2 === bridgeReadPath;
      if (!bridgeRejected && this.#bearerToken) {
        try {
          const probe = await fetch(`${this.baseUrl}${bridgeReadPath}`, {
            headers: this.authorizedHeaders(),
            signal: AbortSignal.timeout(5e3)
          });
          bridgeRejected = probe.status === 401;
          await probe.body?.cancel();
        } catch {
        }
      }
      if (bridgeRejected) {
        this.markAuthorityUnavailable("credential_not_accepted");
        return new BridgeTransportUnavailableError("credential_not_accepted");
      }
    }
    return new Error(`${method} ${path2} failed: ${response.status} ${await response.text()}`);
  }
};
function isCredentialTransportSecure(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "wss:")
      return true;
    if (url.protocol !== "http:" && url.protocol !== "ws:")
      return false;
    const host = url.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

// floe-bridge/dist/project.js
var import_yaml2 = __toESM(require_dist(), 1);
import { createHash as createHash2 } from "node:crypto";
import { existsSync as existsSync3, mkdirSync as mkdirSync3, readdirSync, readFileSync as readFileSync4, statSync, writeFileSync as writeFileSync3 } from "node:fs";
import { basename, dirname as dirname2, isAbsolute as isAbsolute2, join as join3, relative, resolve as resolve3 } from "node:path";

// floe-bridge/dist/prompt-assets.js
import { readFileSync as readFileSync3 } from "node:fs";
var cache = /* @__PURE__ */ new Map();
function readPromptAsset(name) {
  const cached2 = cache.get(name);
  if (cached2 != null)
    return cached2;
  const text = readFileSync3(new URL(`./prompts/${name}`, import.meta.url), "utf8").trim();
  cache.set(name, text);
  return text;
}

// floe-bridge/dist/project.js
var DEFAULT_FLOE_AGENT_BODY = readPromptAsset("default-floe-agent.md");
var DEFAULT_SUBSTRATE_BUILD_SKILL = readPromptAsset("substrate-build-skill.md");
function ensureProjectTemplate(workspacePath, workspaceName) {
  const floeDir = join3(workspacePath, ".floe");
  mkdirSync3(join3(floeDir, "agents"), { recursive: true });
  mkdirSync3(join3(floeDir, "extensions"), { recursive: true });
  mkdirSync3(join3(floeDir, "skills", "substrate-build"), { recursive: true });
  mkdirSync3(join3(floeDir, "mcp"), { recursive: true });
  mkdirSync3(join3(floeDir, "state"), { recursive: true });
  writeIfMissing(join3(floeDir, "floe.yaml"), import_yaml2.default.stringify({
    schema: "floe.workspace.v1",
    version: 1,
    applied_config: {
      config_id: "cfg_composition_floe_default",
      version: 1,
      source: "initial_template"
    },
    agents: [
      {
        id: "floe",
        path: "./agents/floe.md"
      }
    ],
    pulse: {
      default: "off",
      after_idle: "30m",
      min_interval: "30m"
    },
    state: {
      path: "./state"
    }
  }), "utf8");
  writeIfMissing(join3(floeDir, "agents", "floe.md"), `---
schema: floe.agent.v1
agent_id: floe
label: Floe
applied_from:
  config_id: cfg_composition_floe_default
  version: 1
extensions: []
skills:
  - ../skills/substrate-build
mcp: []
pulse:
  inherit: true
scope:
  paths:
    - ./
  services: []
---
${DEFAULT_FLOE_AGENT_BODY}
`, "utf8");
  writeIfMissing(join3(floeDir, "extensions", "README.md"), "# Extensions\n\nProject-local Floe extensions can be placed here.\n", "utf8");
  writeIfMissing(join3(floeDir, "skills", "substrate-build", "SKILL.md"), `${DEFAULT_SUBSTRATE_BUILD_SKILL}
`, "utf8");
  writeIfMissing(join3(floeDir, "mcp", "README.md"), "# MCP\n\nReference or copy runtime-native MCP profiles here when needed.\n", "utf8");
  writeIfMissing(join3(floeDir, "state", "README.md"), "# State\n\nEphemeral project-local Floe runtime state may be placed here.\n", "utf8");
  writeIfMissing(join3(floeDir, "state", ".gitignore"), "*\n!.gitignore\n!README.md\n", "utf8");
}
function writeIfMissing(path2, data, encoding) {
  if (existsSync3(path2))
    return;
  writeFileSync3(path2, data, encoding);
}
function loadProject(workspacePath) {
  const floeDir = join3(workspacePath, ".floe");
  const warnings = [];
  const errors = [];
  if (!existsSync3(floeDir)) {
    return {
      config_hash: "",
      agents: [],
      pulses: [],
      watchers: [],
      validation: { ok: false, warnings, errors: [".floe folder is missing"] }
    };
  }
  const projectConfigPath = join3(floeDir, "floe.yaml");
  if (!existsSync3(projectConfigPath))
    errors.push(".floe/floe.yaml is missing");
  let projectConfig = {};
  if (existsSync3(projectConfigPath)) {
    try {
      projectConfig = import_yaml2.default.parse(readFileSync4(projectConfigPath, "utf8")) ?? {};
      if (projectConfig.schema !== "floe.workspace.v1")
        warnings.push(".floe/floe.yaml schema is not floe.workspace.v1");
    } catch (error) {
      errors.push(`Unable to parse .floe/floe.yaml: ${error.message}`);
    }
  }
  const agentEntries = Array.isArray(projectConfig.agents) ? projectConfig.agents : [{ id: "floe", file: "agents/floe.md" }];
  const agents = [];
  for (const entry of agentEntries) {
    const file = typeof entry.file === "string" ? entry.file : typeof entry.path === "string" ? entry.path : `agents/${entry.id ?? "floe"}.md`;
    let resolvedPath = join3(floeDir, file);
    if (!existsSync3(resolvedPath) && !file.endsWith(".md")) {
      const dirAgent = join3(floeDir, file, "agent.md");
      if (existsSync3(dirAgent))
        resolvedPath = dirAgent;
    }
    if (!existsSync3(resolvedPath)) {
      const dirFallback = join3(floeDir, "agents", entry.id ?? "floe", "agent.md");
      if (existsSync3(dirFallback)) {
        resolvedPath = dirFallback;
      } else {
        errors.push(`Agent file is missing: ${file}`);
        continue;
      }
    }
    const parsed = parseAgentFile(readFileSync4(resolvedPath, "utf8"));
    const agentId = String(parsed.frontmatter.agent_id ?? entry.id ?? basename(resolvedPath, ".md"));
    if ("endpoint_id" in parsed.frontmatter) {
      warnings.push(`${file} contains endpoint_id; canonical project files should omit workspace-specific endpoint ids`);
    }
    agents.push({
      agent_id: agentId,
      name: String(parsed.frontmatter.name ?? titleCase(agentId)),
      file,
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      extensions: Array.isArray(parsed.frontmatter.extensions) ? parsed.frontmatter.extensions.map(String) : []
    });
  }
  const pulses = Array.isArray(projectConfig.pulses) ? projectConfig.pulses.map((p) => ({
    id: String(p.id ?? ""),
    persistence: p.persistence === "local" ? "local" : "workspace",
    scope_id: typeof p.scope_id === "string" ? p.scope_id : void 0,
    trigger: p.trigger ?? { type: "once" },
    content: p.content ?? {},
    subscribers: Array.isArray(p.subscribers) ? p.subscribers : []
  })) : [];
  const watchers = Array.isArray(projectConfig.watchers) ? projectConfig.watchers.filter((w) => w && typeof w.graph_id === "string" && typeof w.node_id === "string" && typeof w.path === "string").map((w) => ({
    id: String(w.id ?? `${w.graph_id}:${w.node_id}`),
    graph_id: String(w.graph_id),
    node_id: String(w.node_id),
    path: String(w.path),
    extensions: Array.isArray(w.extensions) ? w.extensions.map(String) : void 0,
    settle_ms: Number.isInteger(w.settle_ms) ? Number(w.settle_ms) : void 0
  })) : [];
  return {
    config_hash: hashFloeDir(floeDir),
    agents,
    pulses,
    watchers,
    validation: {
      ok: errors.length === 0,
      warnings,
      errors
    }
  };
}
function materializeSavedConfig(workspacePath, config) {
  ensureProjectTemplate(workspacePath, basename(workspacePath));
  const floeDir = join3(workspacePath, ".floe");
  const projectConfigPath = join3(floeDir, "floe.yaml");
  const projectConfig = import_yaml2.default.parse(readFileSync4(projectConfigPath, "utf8")) ?? {};
  const agents = Array.isArray(projectConfig.agents) ? [...projectConfig.agents] : [];
  const configuredAgents = Array.isArray(config.agents) ? config.agents : [];
  for (const agent of configuredAgents) {
    const agentId = slug(String(agent.agent_id ?? agent.id ?? ""));
    if (!agentId)
      continue;
    const name = String(agent.name ?? titleCase(agentId));
    const file = `agents/${agentId}.md`;
    const skills = Array.isArray(agent.skills) ? agent.skills.map(String) : [];
    const body = String(agent.instructions ?? `You are ${name}, a Floe actor for this project.`);
    const frontmatter = {
      schema: "floe.agent.v1",
      agent_id: agentId,
      name,
      skills
    };
    writeFileSync3(join3(floeDir, file), `---
${import_yaml2.default.stringify(frontmatter).trim()}
---
# ${name}

${body.trim()}
`, "utf8");
    const existing = agents.find((entry) => entry.id === agentId);
    if (existing)
      existing.file = file;
    else
      agents.push({ id: agentId, file });
  }
  projectConfig.agents = agents;
  writeFileSync3(projectConfigPath, import_yaml2.default.stringify(projectConfig), "utf8");
  return loadProject(workspacePath);
}
function parseAgentFile(content) {
  if (!content.startsWith("---"))
    return { frontmatter: {}, body: content };
  const marker = "\n---";
  const end = content.indexOf(marker, 3);
  if (end < 0)
    return { frontmatter: {}, body: content };
  const raw = content.slice(3, end).trim();
  const body = content.slice(end + marker.length).replace(/^\r?\n/, "");
  return {
    frontmatter: import_yaml2.default.parse(raw) ?? {},
    body
  };
}
function hashFloeDir(floeDir) {
  const hash = createHash2("sha256");
  for (const file of computeConfigSurface(floeDir)) {
    try {
      const rel = relative(floeDir, file).replace(/\\/g, "/");
      hash.update(rel);
      hash.update("\0");
      hash.update(readFileSync4(file));
      hash.update("\0");
    } catch {
    }
  }
  return `sha256:${hash.digest("hex")}`;
}
function computeConfigSurface(floeDir) {
  const files = /* @__PURE__ */ new Set();
  const addIfExists = (p) => {
    const abs = resolve3(p);
    if (existsSync3(abs))
      files.add(abs);
  };
  const addAllUnder = (dir) => {
    const abs = resolve3(dir);
    if (existsSync3(abs)) {
      for (const f of listFiles(abs))
        files.add(f);
    }
  };
  addIfExists(join3(floeDir, "floe.yaml"));
  addAllUnder(join3(floeDir, "agents"));
  addAllUnder(join3(floeDir, "skills"));
  addAllUnder(join3(floeDir, "mcp"));
  const extensionsDir = join3(floeDir, "extensions");
  let extEntries;
  try {
    extEntries = readdirSync(extensionsDir);
  } catch {
    extEntries = [];
  }
  for (const dirName of extEntries) {
    const extDir = join3(extensionsDir, dirName);
    try {
      if (!statSync(extDir).isDirectory())
        continue;
    } catch {
      continue;
    }
    const manifestPath = join3(extDir, "extension.json");
    if (!existsSync3(manifestPath))
      continue;
    files.add(resolve3(manifestPath));
    let rawManifest;
    let manifestBaseDir = extDir;
    try {
      rawManifest = JSON.parse(readFileSync4(manifestPath, "utf-8"));
    } catch {
      continue;
    }
    if (rawManifest !== null && typeof rawManifest.manifest_source === "string") {
      const sourcePath = resolve3(extDir, rawManifest.manifest_source);
      manifestBaseDir = dirname2(sourcePath);
      if (isUnderDir(sourcePath, floeDir))
        addIfExists(sourcePath);
      try {
        rawManifest = JSON.parse(readFileSync4(sourcePath, "utf-8"));
      } catch {
        continue;
      }
    }
    if (typeof rawManifest.entry === "string") {
      const entryPath = resolve3(manifestBaseDir, rawManifest.entry);
      if (isUnderDir(entryPath, floeDir))
        addIfExists(entryPath);
    }
    if (Array.isArray(rawManifest.agents)) {
      for (const agent of rawManifest.agents) {
        if (agent !== null && typeof agent === "object" && typeof agent.instructions_path === "string") {
          const instrPath = resolve3(manifestBaseDir, agent.instructions_path);
          if (isUnderDir(instrPath, floeDir))
            addIfExists(instrPath);
        }
      }
    }
  }
  return [...files].sort();
}
function isUnderDir(filePath, dir) {
  const rel = relative(resolve3(dir), resolve3(filePath));
  return !rel.startsWith("..") && !isAbsolute2(rel);
}
function listFiles(root) {
  const results = [];
  for (const name of readdirSync(root)) {
    const path2 = resolve3(root, name);
    const stat = statSync(path2);
    if (stat.isDirectory())
      results.push(...listFiles(path2));
    if (stat.isFile())
      results.push(path2);
  }
  return results.sort();
}
function titleCase(value) {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
function slug(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

// floe-bridge/dist/engines/engine-control.js
var EngineControl = class {
  accounts;
  version;
  log;
  peers = /* @__PURE__ */ new Set();
  operations = /* @__PURE__ */ new Map();
  readyListeners = /* @__PURE__ */ new Set();
  constructor(accounts, version, log = () => {
  }) {
    this.accounts = accounts;
    this.version = version;
    this.log = log;
    for (const [engine, account] of accounts) {
      let wasReady = account.currentState().phase === "ready";
      account.on("state", (state) => {
        this.broadcast({ type: "state", engine, state });
        const ready = state.phase === "ready";
        if (ready && !wasReady)
          for (const listener of this.readyListeners)
            listener(engine);
        wasReady = ready;
      });
      account.on("sign_in", (progress) => {
        if (progress.status === "starting")
          this.operations.set(progress.operationId, engine);
        else if (progress.status !== "waiting_for_person")
          this.operations.delete(progress.operationId);
        this.log("engine sign-in", { engine, operation_id: progress.operationId, status: progress.status });
        this.broadcast({
          type: "sign_in",
          operation_id: progress.operationId,
          engine,
          status: progress.status,
          message: progress.message
        });
      });
    }
  }
  /** The engines this Bridge runs work on. */
  get engines() {
    return [...this.accounts.keys()];
  }
  /** One readiness check per engine at start. Deliveries wait on it through gate(). */
  start() {
    for (const engine of this.accounts.keys())
      void this.recheck(engine);
  }
  /** Check an engine again, e.g. after one of its turns failed. */
  recheck(engine) {
    const account = this.accounts.get(engine);
    if (!account)
      return Promise.resolve(null);
    return account.check().catch((error) => {
      this.log("engine check failed", { engine, error: error instanceof Error ? error.message : String(error) });
      return null;
    });
  }
  /**
   * The state work for this engine must see before it runs. A check in progress
   * (or none yet) is awaited, never skipped: work never runs on a guess.
   */
  async gate(engine) {
    const account = this.require(engine);
    const current = account.currentState();
    return current.phase === "checking" ? account.check() : current;
  }
  /** Called once each time an engine becomes ready. */
  onReady(listener) {
    this.readyListeners.add(listener);
    return () => this.readyListeners.delete(listener);
  }
  state() {
    const engines = {};
    for (const [engine, account] of this.accounts)
      engines[engine] = account.currentState();
    return { engines };
  }
  attach(peer) {
    this.peers.add(peer);
  }
  detach(peer) {
    this.peers.delete(peer);
  }
  async handle(_peer, op, args) {
    switch (op) {
      case "state":
        return this.state();
      case "refresh":
        return this.require(stringArg(args, "engine")).check();
      case "sign_in": {
        const engine = stringArg(args, "engine");
        const account = this.require(engine);
        if (!account.signIn)
          throw new ChannelError("sign_in_unsupported", `The ${engine} engine has no sign-in.`);
        const mode = args.mode === void 0 ? void 0 : args.mode;
        if (mode !== void 0 && mode !== "browser") {
          throw new ChannelError("invalid_sign_in_mode", 'mode must be "browser"; device-code sign-in is not available.');
        }
        const { id: id2 } = await vendor(() => account.signIn({ mode }));
        return { operation_id: id2 };
      }
      case "cancel_sign_in": {
        const operationId = stringArg(args, "operation_id");
        const engine = this.operations.get(operationId);
        const account = engine ? this.accounts.get(engine) : void 0;
        if (!account?.cancelSignIn)
          throw new ChannelError("sign_in_not_found", `Sign-in '${operationId}' is not active.`);
        await vendor(() => account.cancelSignIn(operationId));
        return { cancelled: true };
      }
      default:
        throw new ChannelError("unknown_op", `Engine control has no operation '${op}'.`);
    }
  }
  async close() {
    for (const account of this.accounts.values())
      await account.close?.().catch(() => {
      });
  }
  require(engine) {
    const account = this.accounts.get(engine);
    if (!account)
      throw new ChannelError("unknown_engine", `This Floe runs no engine named '${engine}'.`, { engines: this.engines });
    return account;
  }
  broadcast(message) {
    for (const peer of this.peers)
      peer.send(message);
  }
};
function stringArg(args, name) {
  const value = args[name];
  if (typeof value !== "string" || !value.trim())
    throw new ChannelError("invalid_request", `${name} is required.`);
  return value.trim();
}
async function vendor(action) {
  try {
    return await action();
  } catch (error) {
    const code = error.code;
    throw new ChannelError(typeof code === "string" ? code : "failed", error instanceof Error ? error.message : String(error));
  }
}

// floe-cli/dist/installation.js
import { existsSync as existsSync5, readFileSync as readFileSync6, realpathSync as realpathSync2 } from "node:fs";
import { basename as basename3, dirname as dirname4, join as join5 } from "node:path";
import { fileURLToPath } from "node:url";

// floe-cli/dist/staging.js
import { existsSync as existsSync4, mkdirSync as mkdirSync4, readdirSync as readdirSync2, readFileSync as readFileSync5, realpathSync, renameSync as renameSync2, rmSync as rmSync2, statSync as statSync2, writeFileSync as writeFileSync4 } from "node:fs";
import { basename as basename2, dirname as dirname3, join as join4, relative as relative2, sep } from "node:path";
var STAGE_MANIFEST = "stage.json";
function readJson(path2) {
  try {
    return JSON.parse(readFileSync5(path2, "utf8"));
  } catch {
    return null;
  }
}
function stageOf(path2) {
  let dir = path2;
  for (; ; ) {
    const parent = dirname3(dir);
    if (parent === dir)
      return null;
    if (basename2(dir) === "tree") {
      const manifest = readJson(join4(parent, STAGE_MANIFEST));
      if (manifest?.kind === "floe-stage")
        return manifest;
    }
    dir = parent;
  }
}

// floe-cli/dist/installation.js
function nearestPackageDir(start) {
  let dir = start;
  for (; ; ) {
    if (existsSync5(join5(dir, "package.json")))
      return dir;
    const parent = dirname4(dir);
    if (parent === dir)
      return null;
    dir = parent;
  }
}
function readPackage(dir) {
  try {
    return JSON.parse(readFileSync6(join5(dir, "package.json"), "utf8"));
  } catch {
    return {};
  }
}
function classifyPackageDir(packageDir) {
  const pkg = readPackage(packageDir);
  const version = typeof pkg.version === "string" ? pkg.version : null;
  let holder = dirname4(packageDir);
  if (basename3(holder).startsWith("@"))
    holder = dirname4(holder);
  if (basename3(holder) !== "node_modules")
    return { packageDir, version, dependencyOf: null };
  const owner = dirname4(holder);
  if (!existsSync5(join5(owner, "package.json")))
    return { packageDir, version, dependencyOf: null };
  const ownerName = readPackage(owner).name;
  return { packageDir, version, dependencyOf: typeof ownerName === "string" ? ownerName : owner };
}
var cached;
function thisInstallation() {
  if (cached)
    return cached;
  const moduleDir = realpathSync2(dirname4(fileURLToPath(import.meta.url)));
  const packageDir = nearestPackageDir(moduleDir) ?? moduleDir;
  const stage = stageOf(packageDir);
  cached = stage ? { packageDir: stage.source, version: stage.version, dependencyOf: stage.dependency_of } : classifyPackageDir(packageDir);
  return cached;
}

// floe-bridge/dist/adapters/fake-runtime-adapter.js
import { randomUUID as randomUUID2 } from "node:crypto";

// floe-bridge/dist/runtime-core/substrate-tools.js
import { randomUUID } from "node:crypto";

// floe-bridge/dist/runtime-core/neutral-ref.js
function toNeutralRef(actorId) {
  if (!actorId)
    return actorId;
  const parts = actorId.split(":");
  if (parts[0] === "endpoint") {
    throw new Error(`[neutral-ref] Legacy endpoint: id encountered after hard cutover: "${actorId}". All ids must use the actor:<workspace_id>:<actor_id> shape.`);
  }
  if (parts[0] === "actor" && parts.length >= 3) {
    if (parts[1] === "workspace" && parts.length >= 4) {
      return parts.slice(3).join(":");
    }
    return parts.slice(2).join(":");
  }
  return actorId;
}
function fromNeutralRef(ref, endpoints) {
  if (!ref)
    return null;
  if (ref.startsWith("endpoint:")) {
    throw new Error(`[neutral-ref] Legacy endpoint: id passed to fromNeutralRef after hard cutover: "${ref}". All ids must use the actor:<workspace_id>:<actor_id> shape.`);
  }
  if (ref.startsWith("actor:")) {
    const direct = endpoints.find((ep) => ep.endpoint_id === ref);
    return direct ? direct.endpoint_id : null;
  }
  const matches = endpoints.filter((ep) => toNeutralRef(ep.endpoint_id) === ref);
  if (matches.length === 1)
    return matches[0].endpoint_id;
  if (matches.length === 0)
    return null;
  console.warn("[bridge] fromNeutralRef: ambiguous neutral ref \u2014 multiple endpoints share the same local name", { ref, candidates: matches.map((m) => m.endpoint_id) });
  return null;
}

// floe-bridge/dist/runtime-core/substrate-tools.js
async function executeEmit(bus, turn, params, identity) {
  const destinationRef = String(params?.destination ?? "");
  let destination;
  let destinationLabel = destinationRef;
  if (destinationRef === "current_context") {
    if (!turn.context_id) {
      return {
        result: {
          content: [{ type: "text", text: "emit: this turn has no current Context." }],
          details: { ok: false, error: "context_unavailable" }
        }
      };
    }
    destination = { kind: "context", context_id: turn.context_id };
  } else {
    let targetEndpoint = destinationRef;
    if (!targetEndpoint.startsWith("actor:")) {
      const ref = targetEndpoint;
      const endpoints = await bus.listEndpoints(turn.workspace_id);
      const resolved = fromNeutralRef(ref, endpoints);
      if (!resolved) {
        return {
          result: {
            content: [{ type: "text", text: `emit: destination '${ref}' did not resolve to a known actor. Use list_endpoints when actor discovery is needed.` }],
            details: { ok: false, error: "unknown_destination", ref }
          }
        };
      }
      targetEndpoint = resolved;
    }
    destination = { kind: "endpoint", endpoint_id: targetEndpoint };
    destinationLabel = targetEndpoint;
  }
  const attachments = Array.isArray(params?.attachments) ? params.attachments.map((attachment) => ({
    artefact_version_id: attachment.artefact_version_id,
    name: attachment.name
  })) : [];
  const versionIds = [.../* @__PURE__ */ new Set([
    ...Array.isArray(params?.artefact_version_ids) ? params.artefact_version_ids : [],
    ...attachments.map((attachment) => attachment.artefact_version_id)
  ])];
  const receipt = await bus.emit({
    type: String(params?.type ?? "message"),
    workspace_id: turn.workspace_id,
    source_endpoint_id: turn.endpoint_id,
    destination,
    thread_id: turn.thread_id,
    context_id: destination.kind === "context" ? turn.context_id : null,
    current_delivery_context_id: turn.context_id,
    correlation_id: null,
    artefact_version_ids: versionIds,
    content: {
      text: String(params?.text ?? ""),
      ...Array.isArray(params?.references) && params.references.length ? { references: params.references } : {},
      ...attachments.length ? { attachments } : {},
      data: {
        ...params?.data && typeof params.data === "object" && !Array.isArray(params.data) ? params.data : {},
        origin: identity.emitOrigin,
        runtime_turn_id: turn.runtime_turn_id,
        delivery_id: turn.delivery_id,
        execution_attempt_id: turn.execution_attempt_id
      }
    },
    response: { expected: false },
    metadata: {
      runtime: identity.runtimeName,
      origin: identity.emitOrigin,
      runtime_turn_id: turn.runtime_turn_id,
      delivery_id: turn.delivery_id,
      execution_attempt_id: turn.execution_attempt_id
    }
  });
  const accepted = {
    ok: true,
    event_id: receipt?.event_id ?? null,
    accepted_at: receipt?.accepted_at ?? null,
    artefact_version_ids: receipt?.event?.artefact_version_ids ?? null
  };
  return {
    result: { content: [{ type: "text", text: JSON.stringify(accepted) }], details: accepted },
    emitted: {
      type: String(params?.type ?? "message"),
      destination: destinationLabel,
      text_preview: String(params?.text ?? "").slice(0, 120),
      response_expected: false
    }
  };
}
async function executeRequest(bus, turn, params, identity, alreadyRequested) {
  if (alreadyRequested) {
    return {
      result: {
        content: [{ type: "text", text: "request: this processing cycle already has a pending actor dependency" }],
        details: { ok: false, error: "dependency_already_requested" }
      },
      dependencyRequested: false
    };
  }
  const actorRef = String(params?.actor ?? "");
  let targetEndpoint = actorRef;
  if (!targetEndpoint.startsWith("actor:")) {
    const endpoints = await bus.listEndpoints(turn.workspace_id);
    const resolved = fromNeutralRef(actorRef, endpoints);
    if (!resolved) {
      return {
        result: {
          content: [{ type: "text", text: `request: actor '${actorRef}' did not resolve. Use list_endpoints when actor discovery is needed.` }],
          details: { ok: false, error: "unknown_actor", actor: actorRef }
        },
        dependencyRequested: false
      };
    }
    targetEndpoint = resolved;
  }
  const requestId = `req_${randomUUID()}`;
  const receipt = await bus.emit({
    type: "request",
    workspace_id: turn.workspace_id,
    source_endpoint_id: turn.endpoint_id,
    destination: { kind: "endpoint", endpoint_id: targetEndpoint },
    thread_id: turn.thread_id,
    context_id: null,
    current_delivery_context_id: turn.context_id,
    correlation_id: requestId,
    artefact_version_ids: [...new Set(params?.artefact_version_ids ?? [])],
    content: {
      text: String(params?.work ?? ""),
      data: {
        origin: identity.requestOrigin,
        runtime_turn_id: turn.runtime_turn_id,
        delivery_id: turn.delivery_id,
        execution_attempt_id: turn.execution_attempt_id
      }
    },
    response: {
      expected: true,
      mode: "correlated",
      correlation_id: requestId
    },
    metadata: {
      runtime: identity.runtimeName,
      origin: identity.requestOrigin,
      request_return_context_id: turn.context_id,
      request_parent_delivery_id: turn.delivery_id,
      // A direct Actor request is not a graph Edge. When it is made
      // during a NodeExecution, these exact references let the result
      // resume that same logical execution under its pinned revision.
      request_parent_scope_execution_id: turn.scope_execution_id,
      request_parent_composition_revision_id: turn.composition_revision_id,
      request_parent_node_execution_id: turn.node_execution_id,
      request_parent_target_node_id: turn.target_node_id,
      request_parent_execution_attempt_id: turn.execution_attempt_id,
      request_continuation_event_id: turn.invocation_request_event_id,
      runtime_turn_id: turn.runtime_turn_id,
      delivery_id: turn.delivery_id,
      execution_attempt_id: turn.execution_attempt_id
    }
  });
  const accepted = {
    ok: true,
    actor: actorRef,
    event_id: receipt?.event_id ?? null,
    artefact_version_ids: receipt?.event?.artefact_version_ids ?? null,
    message: "request accepted; Floe will resume you with this actor's result"
  };
  return {
    result: { content: [{ type: "text", text: JSON.stringify(accepted) }], details: accepted },
    emitted: {
      type: "request",
      destination: String(targetEndpoint),
      text_preview: String(params?.work ?? "").slice(0, 120),
      response_expected: true
    },
    dependencyRequested: true
  };
}

// floe-bridge/dist/adapters/fake-runtime-adapter.js
var FAKE_IDENTITY = {
  runtimeName: "fake",
  emitOrigin: "fake_emit_tool",
  requestOrigin: "fake_request_tool"
};
var FakeRuntimeAdapter = class {
  name = "fake";
  async handleBundle(context, bundle, _runtimeConfig) {
    const trigger = bundle.events[0];
    const text = firstText(trigger);
    const pulseEvents = bundle.events.filter((e) => e.type === "pulse.fired");
    if (pulseEvents.length > 0 && context.hooks?.hasHandlers("Pulse")) {
      for (const pulseEvent of pulseEvents) {
        await context.hooks.fire("Pulse", {
          endpoint_id: bundle.endpoint_id,
          workspace_id: bundle.workspace_id,
          delivery_id: bundle.delivery_id,
          trigger_event_id: bundle.trigger_event_id,
          pulse_id: pulseEvent.content?.pulse_id ?? pulseEvent.metadata?.pulse_id,
          event_id: pulseEvent.event_id,
          thread_id: pulseEvent.thread_id,
          content: pulseEvent.content
        });
      }
    }
    const ask = trigger?.content?.data?.ask;
    if (ask?.actor && trigger?.type !== "request.result") {
      const anchor = {
        workspace_id: bundle.workspace_id,
        endpoint_id: bundle.endpoint_id,
        thread_id: typeof trigger?.thread_id === "string" ? trigger.thread_id : "",
        context_id: trigger?.context_id ?? null,
        runtime_turn_id: `rt_${randomUUID2()}`,
        delivery_id: bundle.delivery_id,
        execution_attempt_id: bundle.execution_attempt_id ?? null,
        scope_execution_id: bundle.scope_execution_id ?? null,
        composition_revision_id: bundle.composition_revision_id ?? null,
        node_execution_id: bundle.node_execution_id ?? null,
        target_node_id: bundle.target_node_id ?? null,
        invocation_request_event_id: null
      };
      await executeRequest(context.bus, anchor, { actor: ask.actor, work: ask.work ?? "" }, FAKE_IDENTITY, false);
      await context.bus.recordRuntimeTurnResult({
        delivery_id: bundle.delivery_id,
        outcome: "completed",
        text: `Fake Floe asked ${ask.actor} and is waiting for its response.`,
        metadata: { runtime: this.name, delivery_id: bundle.delivery_id, asked: ask.actor }
      });
      return;
    }
    if (trigger?.type === "request.result") {
      await context.bus.appendRuntimeTelemetry({
        workspace_id: bundle.workspace_id,
        endpoint_id: bundle.endpoint_id,
        delivery_id: bundle.delivery_id,
        kind: "visible_output",
        payload: { text: `Fake runtime resumed with an actor response.` }
      });
      await context.bus.recordRuntimeTurnResult({
        delivery_id: bundle.delivery_id,
        outcome: "completed",
        text: `Fake Floe resumed with the response: "${text}".`,
        metadata: { runtime: this.name, delivery_id: bundle.delivery_id, resumed_with: text }
      });
      return;
    }
    await context.bus.appendRuntimeTelemetry({
      workspace_id: bundle.workspace_id,
      endpoint_id: bundle.endpoint_id,
      delivery_id: bundle.delivery_id,
      kind: "visible_output",
      payload: {
        text: `Fake runtime accepted ${bundle.events.length} event(s).`
      }
    });
    await context.bus.recordRuntimeTurnResult({
      delivery_id: bundle.delivery_id,
      outcome: "completed",
      text: `Fake Floe received: "${text}". I processed the local delivery and ended the turn normally.`,
      metadata: {
        runtime: this.name,
        delivery_id: bundle.delivery_id
      }
    });
  }
};
function firstText(event) {
  const value = event.content?.text;
  return typeof value === "string" && value.trim() ? value.trim() : event.type;
}

// floe-bridge/dist/adapters/floe-runtime-adapter.js
import { randomUUID as randomUUID5 } from "node:crypto";

// node_modules/floe-runtime/src/runtime.mjs
import { EventEmitter as EventEmitter2 } from "node:events";

// node_modules/floe-runtime/src/jsonrpc.mjs
import { spawn } from "node:child_process";
import { existsSync as existsSync6 } from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { EventEmitter } from "node:events";

// node_modules/floe-runtime/src/errors.mjs
var RuntimeFault = class extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = "RuntimeFault";
    this.code = code;
    this.status = status;
  }
};
function check(condition, code, message, status = 500) {
  if (!condition) throw new RuntimeFault(code, message, status);
}
function id(scope) {
  return `${scope}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
function digest(text) {
  let hash = 0n;
  const prime = 1099511628211n;
  let offset = 14695981039346656037n;
  const bytes = Buffer.from(text, "utf8");
  for (const byte of bytes) {
    offset ^= BigInt(byte);
    offset = offset * prime & 0xffffffffffffffffn;
  }
  hash = offset;
  return hash.toString(16).padStart(16, "0");
}
function redact(text, maxLength = 4e3) {
  return String(text).slice(-maxLength);
}

// node_modules/floe-runtime/src/jsonrpc.mjs
var MAX_BUFFER_BYTES = 16 * 1024 * 1024;
var WIN32 = process.platform === "win32";
var CMD_META_CHARS = /[()%!^"<>&|;, ]/;
function resolveExecutable(command, env = process.env) {
  if (!WIN32) return { file: command, needsShellWrapper: false };
  const exts = (env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  const hasSep = command.includes("/") || command.includes("\\");
  const alreadyHasExt = exts.some((ext2) => command.toLowerCase().endsWith(ext2.toLowerCase()));
  const candidates = [];
  if (hasSep || alreadyHasExt) {
    candidates.push(command);
    if (!alreadyHasExt) for (const ext2 of exts) candidates.push(command + ext2);
  } else {
    const dirs = (env.PATH || env.Path || "").split(path.delimiter).filter(Boolean);
    for (const dir of dirs) {
      for (const ext2 of exts) candidates.push(path.join(dir, command + ext2));
      candidates.push(path.join(dir, command));
    }
  }
  const resolved = candidates.find((candidate) => existsSync6(candidate));
  const file = resolved || command;
  const ext = path.extname(file).toLowerCase();
  return { file, needsShellWrapper: ext === ".cmd" || ext === ".bat" };
}
function quoteCmdArg(arg) {
  const value = String(arg);
  if (value === "") return '""';
  if (!CMD_META_CHARS.test(value)) return value;
  return '"' + value.replace(/"/g, '""') + '"';
}
var JsonRpcPeer = class extends EventEmitter {
  constructor({ command, args = [], env = process.env, unavailableCode = "runtime_unavailable" } = {}) {
    super();
    this.command = command;
    this.args = args;
    this.env = env;
    this.unavailableCode = unavailableCode;
    this.process = null;
    this.pending = /* @__PURE__ */ new Map();
    this.awaitingResponse = /* @__PURE__ */ new Set();
    this.serial = 0;
    this.buffer = "";
    this.decoder = new StringDecoder("utf8");
  }
  /** Spawns the subprocess. Must be called once before request()/notify() will work. */
  spawn() {
    const { file, needsShellWrapper } = resolveExecutable(this.command, this.env);
    const proc = needsShellWrapper ? spawn(
      this.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", quoteCmdArg(file), ...this.args.map(quoteCmdArg)],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, windowsVerbatimArguments: true, env: this.env }
    ) : spawn(file, this.args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env: this.env });
    this.process = proc;
    proc.stdout.on("data", (chunk) => this.#onData(chunk));
    proc.stderr.on("data", (chunk) => this.emit("diagnostic", redact(chunk.toString())));
    proc.on("error", (error) => this.emit("error", error));
    proc.on("exit", (code, signal) => this.emit("exit", code, signal));
    return proc;
  }
  #onData(chunk) {
    this.buffer += this.decoder.write(chunk);
    if (this.buffer.length > MAX_BUFFER_BYTES) {
      this.emit("error", new Error("Subprocess emitted an oversized protocol frame."));
      this.process?.kill();
      return;
    }
    for (; ; ) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) break;
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        this.emit("diagnostic", "Invalid protocol message: " + error.message);
        continue;
      }
      this.#dispatch(message);
    }
  }
  #dispatch(message) {
    if (message.id !== void 0 && !message.method) {
      const key = String(message.id);
      const request = this.pending.get(key);
      if (!request) return;
      this.pending.delete(key);
      clearTimeout(request.timer);
      if (message.error) request.reject(new RuntimeFault("rpc_error", message.error.message || "The subprocess rejected the request.", 502));
      else request.resolve(message.result);
      return;
    }
    if (message.id !== void 0 && message.method) {
      this.awaitingResponse.add(String(message.id));
      this.emit("request", message);
      return;
    }
    this.emit("notification", message);
  }
  /** Sends a JSON-RPC request and resolves/rejects with the correlated response. */
  request(method, params, timeoutMs = 3e4) {
    return new Promise((resolve6, reject) => {
      if (!this.process?.stdin.writable) {
        reject(new RuntimeFault(this.unavailableCode, `${this.command} is unavailable.`, 503));
        return;
      }
      const requestId = String(++this.serial);
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new RuntimeFault("rpc_timeout", `${method} did not acknowledge in time. Its outcome may be unknown.`, 504));
      }, timeoutMs);
      this.pending.set(requestId, { resolve: resolve6, reject, timer });
      this.process.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }) + "\n", (error) => {
        if (error) {
          clearTimeout(timer);
          this.pending.delete(requestId);
          reject(error);
        }
      });
    });
  }
  /** Sends a one-way JSON-RPC notification (no response expected). */
  notify(method, params) {
    this.process?.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }
  /** Responds to an inbound server-initiated request (from `request` events) with a result. */
  respond(requestId, result2) {
    this.awaitingResponse.delete(String(requestId));
    this.process?.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: requestId, result: result2 }) + "\n");
  }
  /** Responds to an inbound server-initiated request with an error. */
  respondError(requestId, message, code = -32e3) {
    this.awaitingResponse.delete(String(requestId));
    this.process?.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: requestId, error: { code, message } }) + "\n");
  }
  /** True while an inbound request from the subprocess is still waiting for respond()/respondError(). */
  isAwaitingResponse(requestId) {
    return this.awaitingResponse.has(String(requestId));
  }
  /** Rejects all pending requests (used when the connection is lost) and resets buffering state. */
  reset(error) {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    this.awaitingResponse.clear();
    this.buffer = "";
    this.decoder = new StringDecoder("utf8");
  }
  /** Gracefully terminates the subprocess, escalating to SIGKILL after `graceMs`. */
  async terminate(graceMs = 3e3) {
    const proc = this.process;
    if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
    await new Promise((resolve6) => {
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve6();
      }, graceMs);
      proc.once("exit", () => {
        clearTimeout(timer);
        resolve6();
      });
      proc.kill("SIGTERM");
    });
  }
};

// node_modules/floe-runtime/src/events.mjs
var DEFAULT_BUFFER_SIZE = 500;
function toSerializable(value) {
  if (value === void 0) return null;
  return JSON.parse(JSON.stringify(value));
}
var EventLog = class {
  constructor(bufferSize = DEFAULT_BUFFER_SIZE) {
    this.bufferSize = bufferSize;
    this.seqs = /* @__PURE__ */ new Map();
    this.buffers = /* @__PURE__ */ new Map();
  }
  /** Wraps `data` into a JSON-safe envelope with the next monotonic seq for `conversationId`, and buffers it. */
  publish(conversationId, type, data, { replay = false } = {}) {
    const seq = (this.seqs.get(conversationId) || 0) + 1;
    this.seqs.set(conversationId, seq);
    const envelope = { seq, conversationId, type, replay, at: Date.now(), data: toSerializable(data) };
    let buffer = this.buffers.get(conversationId);
    if (!buffer) {
      buffer = [];
      this.buffers.set(conversationId, buffer);
    }
    buffer.push(envelope);
    if (buffer.length > this.bufferSize) buffer.shift();
    return envelope;
  }
  /**
   * Returns every buffered envelope for `conversationId` with seq > `afterSeq`, plus `missed`: the count of
   * envelopes that fell out of the bounded buffer before a consumer could see them (0 if none were lost).
   */
  since(conversationId, afterSeq = 0) {
    const buffer = this.buffers.get(conversationId) || [];
    const oldestSeq = buffer.length ? buffer[0].seq : (this.seqs.get(conversationId) || 0) + 1;
    const missed = afterSeq > 0 && afterSeq < oldestSeq - 1 ? oldestSeq - 1 - afterSeq : 0;
    return { events: buffer.filter((envelope) => envelope.seq > afterSeq), missed };
  }
  clear(conversationId) {
    this.buffers.delete(conversationId);
    this.seqs.delete(conversationId);
  }
};
function watchEvents(runtime, conversationId, { since = 0 } = {}) {
  const queue = [];
  let waiter = null;
  let closed = false;
  const push = (envelope) => {
    if (envelope.conversationId !== conversationId) return;
    queue.push(envelope);
    if (waiter) {
      const resolve6 = waiter;
      waiter = null;
      resolve6();
    }
  };
  const onLost = () => {
    closed = true;
    if (waiter) {
      const resolve6 = waiter;
      waiter = null;
      resolve6();
    }
  };
  runtime.on("event", push);
  runtime.once("lost", onLost);
  const { events: backlog, missed } = runtime.eventLog.since(conversationId, since);
  async function* generator() {
    try {
      if (missed > 0) yield { seq: since, conversationId, type: "gap", replay: true, at: Date.now(), data: { missed } };
      for (const envelope of backlog) yield envelope;
      while (!closed) {
        if (queue.length === 0) await new Promise((resolve6) => {
          waiter = resolve6;
        });
        while (queue.length > 0) yield queue.shift();
      }
    } finally {
      runtime.off("event", push);
      runtime.off("lost", onLost);
    }
  }
  return generator();
}

// node_modules/floe-runtime/src/runtime.mjs
var DEFAULT_UNHANDLED_REQUEST_TIMEOUT_MS = 2e4;
var DEFAULT_PERMISSION_DECISION = "reject_once";
var Runtime = class extends EventEmitter2 {
  constructor({
    command,
    args = [],
    env = process.env,
    unavailableCode = "runtime_unavailable",
    permissionPolicy = null,
    defaultPermissionDecision = DEFAULT_PERMISSION_DECISION,
    unhandledRequestTimeoutMs = DEFAULT_UNHANDLED_REQUEST_TIMEOUT_MS,
    replayBufferSize
  } = {}) {
    super();
    this.command = command;
    this.args = args;
    this.env = env;
    this.unavailableCode = unavailableCode;
    this.ready = false;
    this.peer = null;
    this.starting = null;
    this.closing = false;
    this.losing = false;
    this.info = null;
    this.permissionPolicy = permissionPolicy;
    this.defaultPermissionDecision = defaultPermissionDecision;
    this.unhandledRequestTimeoutMs = unhandledRequestTimeoutMs;
    this.eventLog = new EventLog(replayBufferSize);
    this.replaying = /* @__PURE__ */ new Set();
  }
  /** Spawns the subprocess and performs the protocol handshake (idempotent, concurrency-safe). */
  async start() {
    if (this.ready) return this.info;
    if (this.starting) return this.starting;
    this.starting = (async () => {
      this.closing = false;
      const peer = new JsonRpcPeer({ command: this.command, args: this.args, env: this.env, unavailableCode: this.unavailableCode });
      peer.on("diagnostic", (text) => this.emit("diagnostic", text));
      peer.on("notification", (message) => this.#onNotification(message));
      peer.on("request", (message) => this.#onRequest(message));
      peer.on("error", (error) => this.#lost(new RuntimeFault(this.unavailableCode, `${this.command} could not start: ${error.message}.`, 503)));
      peer.on("exit", (code, signal) => {
        if (this.peer !== peer) return;
        this.#lost(new RuntimeFault(`${this.unavailableCode}`, `${this.command} exited (${signal || code}).`, 503));
      });
      this.peer = peer;
      peer.spawn();
      this.info = await this.handshake(peer);
      this.ready = true;
      this.emit("ready", this.info);
      return this.info;
    })();
    try {
      return await this.starting;
    } finally {
      this.starting = null;
    }
  }
  /** Adapter hook: perform the protocol-specific initialize handshake and return an info object. */
  // eslint-disable-next-line class-methods-use-this
  async handshake() {
    throw new RuntimeFault("not_implemented", "Runtime subclasses must implement handshake().", 500);
  }
  /** Adapter hook: handle an inbound JSON-RPC notification from the subprocess. */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  onNotification(message) {
  }
  /** Adapter hook: handle an inbound JSON-RPC request from the subprocess (e.g. permission prompts). */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  onRequest(message) {
  }
  /** Adapter hook: reset any in-memory session/turn state after the connection is lost. */
  // eslint-disable-next-line class-methods-use-this
  onLost() {
  }
  /** Adapter hook: interrupt any active turns before the subprocess is terminated in close(). */
  // eslint-disable-next-line class-methods-use-this
  async onClosing() {
  }
  /**
   * Adapter hook: normalize an inbound request into a backend-neutral permission
   * request (see permissions.mjs), or return null if this message is not one
   * (e.g. a data-form elicitation with no yes/no decision, or an unrelated
   * request type). Only messages this returns non-null for are auto-answered
   * by the policy/default path below.
   */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  normalizePermissionRequest(message) {
    return null;
  }
  /** Adapter hook: translate a resolved decision back into the backend's wire response and respond(). */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  resolvePermissionRequest(message, decision) {
  }
  /**
   * Declares which of the parity-surface methods (setModel, setMode, setPermissions,
   * setGoal, compact, usage, steer, fork, listSessions, resume, streaming,
   * richPrompt, availableCommands; releaseSession is always supported, it is
   * just retire() under another name) this adapter backs natively. Consumers
   * can check this ahead of calling to avoid a capability_unsupported fault.
   * See src/capabilities.mjs for the full FEATURES list.
   */
  // eslint-disable-next-line class-methods-use-this
  capabilities() {
    return {};
  }
  /** Alias for retire() under the parity-surface name (see capabilities.mjs P2). */
  releaseSession(sessionId) {
    return this.retire(sessionId);
  }
  /**
   * Publishes one backend-neutral event for `conversationId` (a threadId/sessionId): wraps `data` into a
   * JSON-safe, sequence-numbered envelope (see src/events.mjs), buffers it for replay, emits it on the
   * unified `'event'` stream, AND emits it under its own `type` (e.g. `'activity'`, `'stream'`) for
   * backward-compatible named-event listeners. `replay` defaults to whether this conversationId is
   * currently in `this.replaying` (see resume()/session-load-driven history flows in each adapter).
   */
  publish(conversationId, type, data, { replay } = {}) {
    const envelope = this.eventLog.publish(conversationId, type, data, { replay: replay ?? this.replaying.has(conversationId) });
    this.emit("event", envelope);
    this.emit(type, data);
    return envelope;
  }
  /**
   * An async-iterable live feed of every event published for `conversationId`, so a consumer can
   * `for await (const envelope of runtime.events(sessionId))` over a turn's activity/stream/lifecycle
   * without correlating ids by hand. Replays buffered history first (see EventLog#since()), signalling a
   * `'gap'` envelope if `since` has already fallen out of the bounded buffer, then yields live events
   * until the caller stops iterating or the runtime disconnects.
   */
  events(conversationId, options) {
    return watchEvents(this, conversationId, options);
  }
  /**
   * Adapter hook: releases backend sessions/threads this runtime instance did not create or is no longer
   * tracking, if they have been idle beyond `maxAgeMs` (see each adapter's implementation using its own
   * listSessions()). This is the orphan-crash safety net described in the package README's Conversation
   * lifetime section - it must never sweep anything still resumable within the window, and the default
   * window must be generous (weeks, not days).
   */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async sweepOrphans(options) {
    throw new RuntimeFault("not_implemented", "Runtime subclasses must implement sweepOrphans().", 500);
  }
  #onNotification(message) {
    this.onNotification(message);
    this.emit("notification", message);
  }
  #onRequest(message) {
    this.onRequest(message);
    const normalized = this.listenerCount("request") === 0 ? this.normalizePermissionRequest(message) : null;
    if (normalized) this.#handlePermission(message, normalized).catch((error) => this.emit("diagnostic", "Permission handling failed: " + error.message));
    this.emit("request", message);
    this.#armUnhandledRequestTimeout(message);
  }
  async #handlePermission(message, normalized) {
    let decision = null;
    if (this.permissionPolicy) {
      try {
        decision = await this.permissionPolicy(normalized);
      } catch (error) {
        this.emit("diagnostic", "permissionPolicy threw; falling back to the default decision: " + error.message);
      }
    }
    const valid = decision && (normalized.options.some((option) => option.decision === decision) || decision === "cancel");
    this.resolvePermissionRequest(message, valid ? decision : this.defaultPermissionDecision);
  }
  /** Last-resort safety net: any inbound request left unanswered after the timeout is auto-declined. */
  #armUnhandledRequestTimeout(message) {
    if (!this.peer) return;
    const requestId = String(message.id);
    const timer = setTimeout(() => {
      if (this.peer?.isAwaitingResponse(requestId)) {
        this.respondError(requestId, "No permission policy or listener answered this runtime request in time; it was automatically declined.", -32e3);
      }
    }, this.unhandledRequestTimeoutMs);
    timer.unref?.();
  }
  #lost(error) {
    if (this.losing) return;
    this.losing = true;
    this.ready = false;
    this.peer?.reset(error);
    this.onLost(error);
    if (!this.closing) this.emit("lost", error);
    this.losing = false;
  }
  /** Sends a JSON-RPC request to the subprocess. */
  request(method, params, timeoutMs) {
    if (!this.peer) return Promise.reject(new RuntimeFault(this.unavailableCode, `${this.command} is unavailable.`, 503));
    return this.peer.request(method, params, timeoutMs);
  }
  /** Sends a one-way JSON-RPC notification to the subprocess. */
  notify(method, params) {
    this.peer?.notify(method, params);
  }
  /** Responds to an inbound server-initiated request. */
  respond(requestId, result2) {
    this.peer?.respond(requestId, result2);
  }
  /** Responds to an inbound server-initiated request with an error. */
  respondError(requestId, message, code) {
    this.peer?.respondError(requestId, message, code);
  }
  /** Interrupts active work, then terminates the subprocess. Safe to call even if never started. */
  async close() {
    this.closing = true;
    await this.onClosing();
    if (this.peer) await this.peer.terminate();
    this.ready = false;
  }
};

// node_modules/floe-runtime/src/session-reuse.mjs
function sessionKey({ role, cwd, model, settings, permissions, scope }) {
  return digest(JSON.stringify({ role, cwd, model, settings, permissions, scope }));
}
var SessionRegistry = class {
  constructor() {
    this.sessions = /* @__PURE__ */ new Map();
  }
  set(sessionId, { key, result: result2, instanceId = null, ...extra } = {}) {
    this.sessions.set(sessionId, { key, result: result2, stopped: false, instanceId, ...extra });
  }
  get(sessionId) {
    return this.sessions.get(sessionId);
  }
  has(sessionId) {
    return this.sessions.has(sessionId);
  }
  /** Marks a session as having confirmed a clean stop (required before reuse or retirement). */
  markStopped(sessionId) {
    const entry = this.sessions.get(sessionId);
    if (entry) entry.stopped = true;
  }
  delete(sessionId) {
    this.sessions.delete(sessionId);
  }
  clear() {
    this.sessions.clear();
  }
  /** True when `sessionId` is known, confirmed stopped, and matches `key` - i.e. safe to reuse. An entry
   * with `key === null` (freshly resume()d, but never yet claimed by a run() call) is reusable by ANY
   * key - the first run() call after an explicit resume() adopts that key, exactly like an
   * automatically-resumed session already does. Without this, a caller that calls resume() itself
   * (rather than letting run() auto-resume an unknown sessionId) could never reuse the restored session -
   * every subsequent run() would silently start a brand-new one and the "resumed" conversation would be
   * discarded unused. */
  isReusable(sessionId, key) {
    const entry = this.sessions.get(sessionId);
    return !!entry && entry.stopped === true && (entry.key === null || entry.key === key);
  }
};

// node_modules/floe-runtime/src/schema.mjs
function validate(value, schema, location = "report") {
  if (schema.anyOf) {
    for (const candidate of schema.anyOf) {
      try {
        validate(value, candidate, location);
        return value;
      } catch {
      }
    }
    throw new RuntimeFault("report_schema", `${location} does not match the required contract.`, 502);
  }
  const actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  check2(types.includes(actual), location, `must be ${types.join(" or ")}.`);
  if (schema.enum) check2(schema.enum.includes(value), location, "has an unsupported value.");
  if (actual === "string" && Number.isFinite(schema.maxLength)) check2(value.length <= schema.maxLength, location, "is too long.");
  if (actual === "array") {
    if (Number.isFinite(schema.maxItems)) check2(value.length <= schema.maxItems, location, "has too many items.");
    value.forEach((item, i) => validate(item, schema.items, `${location}[${i}]`));
  }
  if (actual === "object") {
    for (const key of schema.required || []) check2(Object.hasOwn(value, key), location, `.${key} is required.`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) check2(schema.properties?.[key], `${location}.${key}`, "is not allowed.");
    }
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties?.[key]) validate(item, schema.properties[key], `${location}.${key}`);
    }
  }
  return value;
}
function check2(condition, location, suffix) {
  if (!condition) throw new RuntimeFault("report_schema", `${location} ${suffix}`, 502);
}
function fencedCandidates(text) {
  const candidates = [];
  const re = /```(?:json)?\s*\n?([\s\S]*?)```/gi;
  let m;
  while (m = re.exec(text)) candidates.push(m[1].trim());
  return candidates;
}
function balancedCandidates(text) {
  const candidates = [];
  let fromIndex = 0;
  for (; ; ) {
    const start = text.indexOf("{", fromIndex);
    if (start === -1) break;
    let depth = 0, inString = false, escape = false, end = -1;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end === -1) break;
    candidates.push(text.slice(start, end));
    fromIndex = end;
  }
  return candidates;
}
function snippet(text, max = 160) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}\u2026` : flat;
}
function extractStructuredOutput(text, schema, { role = "agent" } = {}) {
  const raw = String(text ?? "").trim();
  const tryParse = (candidate) => {
    let parsed;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      return void 0;
    }
    try {
      return validate(parsed, schema);
    } catch {
      return void 0;
    }
  };
  const direct = tryParse(raw);
  if (direct !== void 0) return direct;
  for (const candidate of fencedCandidates(raw)) {
    const result2 = tryParse(candidate);
    if (result2 !== void 0) return result2;
  }
  for (const candidate of balancedCandidates(raw)) {
    const result2 = tryParse(candidate);
    if (result2 !== void 0) return result2;
  }
  const hasAnyJson = fencedCandidates(raw).length > 0 || balancedCandidates(raw).length > 0;
  const detail = hasAnyJson ? `no JSON object in the reply matched the required schema (received: "${snippet(raw)}")` : `no JSON object was found in the reply (received: "${snippet(raw)}")`;
  throw new RuntimeFault("invalid_report", `The ${role} did not return a valid report: ${detail}`, 502);
}

// node_modules/floe-runtime/src/capabilities.mjs
var FEATURES = Object.freeze([
  "setModel",
  "releaseSession",
  "setMode",
  "setPermissions",
  "setGoal",
  "compact",
  "usage",
  "steer",
  "fork",
  "listSessions",
  "resume",
  "streaming",
  "richPrompt",
  "availableCommands",
  // Swarm batch (S5/S6): fleetMode is Copilot's single-session parallel-subagent fan-out (/fleet) -
  // a DIFFERENT shape from src/fleet.mjs's fleet-of-sessions model, see that module's header comment.
  // scheduleRecurring/scheduleOnce are backend-side timers (/every, /after) - the backend wakes itself;
  // floe-runtime never polls for them.
  "fleetMode",
  "scheduleRecurring",
  "scheduleOnce"
]);
function unsupported(backend, feature) {
  throw new RuntimeFault("capability_unsupported", `${feature} is not supported by the ${backend} backend.`, 501);
}

// node_modules/floe-runtime/src/adapters/copilot.mjs
import { CopilotClient as CopilotClient2 } from "@github/copilot-sdk";
import { defineTool } from "@github/copilot-sdk";

// node_modules/floe-runtime/src/adapters/copilot-account.mjs
import { spawn as spawn2 } from "node:child_process";
import { randomUUID as randomUUID3 } from "node:crypto";
import { EventEmitter as EventEmitter3 } from "node:events";
import { CopilotClient } from "@github/copilot-sdk";
var CREDENTIAL_ENVIRONMENT_KEYS = /* @__PURE__ */ new Set([
  "COPILOT_GITHUB_TOKEN",
  "GH_TOKEN",
  "GITHUB_TOKEN"
]);
var PROCESS_GLOBAL_AUTH_TYPES = /* @__PURE__ */ new Set(["env", "token", "api-key", "gh-cli"]);
var NOT_ENTITLED_CODES = /* @__PURE__ */ new Set([
  "copilot_not_entitled",
  "no_copilot_subscription",
  "not_entitled",
  "subscription_required"
]);
var POLICY_BLOCKED_CODES = /* @__PURE__ */ new Set([
  "copilot_policy_blocked",
  "organization_policy_blocked",
  "policy_blocked"
]);
function copilotChildEnvironment(environment = process.env) {
  return Object.fromEntries(
    Object.entries(environment).filter(([key]) => !CREDENTIAL_ENVIRONMENT_KEYS.has(key.toUpperCase()))
  );
}
function errorCode(error) {
  return typeof error?.code === "string" ? error.code.toLowerCase() : "";
}
function accountOf(auth) {
  return auth.login ? { label: auth.login, ...auth.host ? { host: auth.host } : {} } : void 0;
}
var CopilotEngineAccountAdapter = class extends EventEmitter3 {
  constructor({
    clientFactory = (options) => new CopilotClient(options),
    clientOptions = {},
    cliPath,
    environment = process.env,
    spawnProcess = spawn2,
    now = () => (/* @__PURE__ */ new Date()).toISOString(),
    operationId = () => randomUUID3()
  } = {}) {
    super();
    this.clientFactory = clientFactory;
    this.clientOptions = clientOptions;
    this.cliPath = cliPath;
    this.environment = environment;
    this.spawnProcess = spawnProcess;
    this.now = now;
    this.operationId = operationId;
    this.revision = 0;
    this.checking = null;
    this.operations = /* @__PURE__ */ new Map();
    this.current = {
      engine: "copilot",
      phase: "checking",
      authentication: "unknown",
      access: "unknown",
      reachability: "unknown",
      message: "Checking Copilot.",
      checked_at: this.now(),
      revision: this.revision
    };
  }
  currentState() {
    return { ...this.current, ...this.current.account ? { account: { ...this.current.account } } : {} };
  }
  async check() {
    if (this.checking) return this.checking;
    this.checking = this.#check();
    try {
      return await this.checking;
    } finally {
      this.checking = null;
    }
  }
  async #check() {
    this.#publishState({
      phase: "checking",
      authentication: "unknown",
      access: "unknown",
      reachability: "unknown",
      message: "Checking Copilot."
    });
    let client;
    try {
      client = await this.clientFactory(this.#sdkOptions());
      await client.start();
      await client.ping();
    } catch {
      await this.#stopClient(client);
      return this.#publishState({
        phase: "unavailable",
        authentication: "unknown",
        access: "unknown",
        reachability: "unreachable",
        action: "retry",
        message: "Copilot could not be reached."
      });
    }
    try {
      let auth;
      try {
        auth = await client.getAuthStatus();
      } catch {
        return this.#publishState({
          phase: "unavailable",
          authentication: "unknown",
          access: "unknown",
          reachability: "reachable",
          action: "retry",
          message: "Copilot authentication could not be checked."
        });
      }
      if (!auth?.isAuthenticated) {
        return this.#publishState({
          phase: "action_required",
          authentication: "signed_out",
          access: "unknown",
          reachability: "reachable",
          action: "sign_in",
          message: "Copilot is not signed in on this machine."
        });
      }
      if (PROCESS_GLOBAL_AUTH_TYPES.has(auth.authType)) {
        return this.#publishState({
          phase: "action_required",
          authentication: "signed_out",
          access: "unknown",
          reachability: "reachable",
          action: "sign_in",
          message: "Copilot found process-global credentials. Sign in with the vendor OAuth flow."
        });
      }
      const account = accountOf(auth);
      try {
        const models = await client.listModels();
        if (!Array.isArray(models) || models.length === 0) {
          return this.#publishState({
            phase: "action_required",
            authentication: "signed_in",
            access: "unknown",
            reachability: "reachable",
            account,
            action: "retry",
            message: `Signed in${account ? ` as ${account.label}` : ""}, but Copilot access could not be confirmed.`
          });
        }
        return this.#publishState({
          phase: "ready",
          authentication: "signed_in",
          access: "entitled",
          reachability: "reachable",
          account,
          message: `Copilot is ready${account ? ` for ${account.label}` : ""}.`
        });
      } catch (error) {
        const code = errorCode(error);
        if (NOT_ENTITLED_CODES.has(code)) {
          return this.#publishState({
            phase: "action_required",
            authentication: "signed_in",
            access: "not_entitled",
            reachability: "reachable",
            account,
            action: "check_subscription",
            message: `Signed in${account ? ` as ${account.label}` : ""}, but this account has no Copilot plan usable by the CLI.`
          });
        }
        if (POLICY_BLOCKED_CODES.has(code)) {
          return this.#publishState({
            phase: "action_required",
            authentication: "signed_in",
            access: "policy_blocked",
            reachability: "reachable",
            account,
            action: "contact_admin",
            message: `Signed in${account ? ` as ${account.label}` : ""}, but the organization has disabled Copilot CLI.`
          });
        }
        return this.#publishState({
          phase: "action_required",
          authentication: "signed_in",
          access: "unknown",
          reachability: "reachable",
          account,
          action: "retry",
          message: `Signed in${account ? ` as ${account.label}` : ""}, but Copilot access could not be confirmed.`
        });
      }
    } finally {
      await this.#stopClient(client);
    }
  }
  async signIn({ mode = "browser" } = {}) {
    if (mode !== "browser" && mode !== "device") {
      throw new RuntimeFault("invalid_sign_in_mode", `Unsupported Copilot sign-in mode '${mode}'.`, 400);
    }
    if (!this.cliPath) {
      throw new RuntimeFault("copilot_cli_unavailable", "The packaged Copilot CLI path is required for sign-in.", 503);
    }
    if (this.operations.size > 0) {
      throw new RuntimeFault("sign_in_in_progress", "Copilot sign-in is already in progress.", 409);
    }
    const id2 = this.operationId();
    const operation = { id: id2, child: null, cancellationRequested: false, finished: false };
    this.operations.set(id2, operation);
    this.#publishSignIn(operation, "starting", "Starting GitHub sign-in.");
    const loginArgs = ["login", mode === "device" ? "--device-code" : "--web-flow"];
    const isJavaScript = /\.[cm]?js$/i.test(this.cliPath);
    const command = isJavaScript ? process.execPath : this.cliPath;
    const args = isJavaScript ? [this.cliPath, ...loginArgs] : loginArgs;
    try {
      operation.child = this.spawnProcess(command, args, {
        env: copilotChildEnvironment(this.environment),
        stdio: "inherit",
        windowsHide: false
      });
    } catch {
      void this.#finishSignIn(operation, "failed");
      return { id: id2 };
    }
    operation.child.once("spawn", () => {
      if (!operation.finished) {
        this.#publishSignIn(operation, "waiting_for_person", "Finish signing in with GitHub.");
      }
    });
    operation.child.once("error", () => void this.#finishSignIn(operation, "failed"));
    operation.child.once("exit", (code) => {
      const outcome = operation.cancellationRequested ? "cancelled" : code === 0 ? "completed" : "failed";
      void this.#finishSignIn(operation, outcome);
    });
    return { id: id2 };
  }
  async cancelSignIn(id2) {
    const operation = this.operations.get(id2);
    if (!operation || operation.finished) {
      throw new RuntimeFault("sign_in_not_found", `Copilot sign-in operation '${id2}' is not active.`, 404);
    }
    operation.cancellationRequested = true;
    operation.child?.kill();
  }
  async close() {
    for (const operation of this.operations.values()) {
      operation.cancellationRequested = true;
      operation.child?.kill();
    }
  }
  #sdkOptions() {
    const { gitHubToken: _ignoredToken, connection, env: optionEnvironment, ...options } = this.clientOptions;
    const environment = copilotChildEnvironment({ ...this.environment, ...optionEnvironment });
    const safeConnection = connection && typeof connection === "object" ? { ...connection, ...connection.env ? { env: copilotChildEnvironment(connection.env) } : {} } : connection;
    return {
      ...options,
      ...safeConnection ? { connection: safeConnection } : {},
      env: environment,
      useLoggedInUser: true
    };
  }
  async #stopClient(client) {
    if (!client?.stop) return;
    try {
      await client.stop();
    } catch (error) {
      this.emit("diagnostic", `Copilot account check could not stop its SDK client: ${error.message}`);
    }
  }
  async #finishSignIn(operation, outcome) {
    if (operation.finished) return;
    operation.finished = true;
    if (this.checking) await this.checking;
    const state = await this.check();
    if (outcome === "cancelled") {
      this.#publishSignIn(operation, "cancelled", "GitHub sign-in was cancelled.");
    } else if (outcome === "completed" && state.authentication === "signed_in") {
      this.#publishSignIn(operation, "succeeded", "Signed in to GitHub Copilot.");
    } else {
      this.#publishSignIn(operation, "failed", "GitHub sign-in did not complete.");
    }
    this.operations.delete(operation.id);
  }
  #publishState(state) {
    this.current = {
      engine: "copilot",
      ...state,
      checked_at: this.now(),
      revision: ++this.revision
    };
    const published = this.currentState();
    this.emit("state", published);
    return published;
  }
  #publishSignIn(operation, status, message) {
    this.emit("sign_in", {
      operationId: operation.id,
      engine: "copilot",
      status,
      message
    });
  }
};

// node_modules/floe-runtime/src/adapters/copilot.mjs
var COMPLETE_FINISH_REASONS = /* @__PURE__ */ new Set(["stop", "end_turn", "completed", "success"]);
var DEFAULT_QUIESCE_TIMEOUT_MS = 1e4;
var TOKEN_USAGE_FIELDS = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"];
function sdkError(code, message, status = 502, cause) {
  const error = new RuntimeFault(code, message, status);
  if (cause) error.cause = cause;
  return error;
}
function normalizeTool(tool) {
  if (!tool || typeof tool !== "object" || typeof tool.name !== "string" || typeof tool.handler !== "function") {
    throw new TypeError("Copilot host tools require a name and handler.");
  }
  return { ...tool };
}
function aggregateUsage(modelCalls, numToolCalls) {
  if (modelCalls.length === 0) return null;
  const latest = modelCalls.at(-1);
  const usage = {
    ...latest,
    numModelCalls: modelCalls.length,
    numToolCalls,
    modelCalls: modelCalls.map((call) => ({ ...call }))
  };
  for (const field of TOKEN_USAGE_FIELDS) {
    usage[field] = modelCalls.reduce((total, call) => total + (Number.isFinite(call[field]) ? call[field] : 0), 0);
  }
  return usage;
}
function promptOptions(input) {
  if (typeof input.prompt === "string") return { prompt: input.prompt };
  if (!Array.isArray(input.blocks) || input.blocks.length === 0) {
    throw sdkError("invalid_prompt", "Copilot requires prompt text or supported prompt blocks.", 400);
  }
  const text = [];
  const attachments = [];
  for (const block of input.blocks) {
    if (!block || typeof block !== "object") throw sdkError("unsupported_prompt_block", "Copilot prompt blocks must be objects.", 400);
    if (block.type === "text" && typeof block.text === "string") {
      text.push(block.text);
    } else if ((block.type === "file" || block.type === "directory") && typeof block.path === "string") {
      attachments.push({ type: block.type, path: block.path, ...block.displayName ? { displayName: block.displayName } : {} });
    } else if (block.type === "selection" && typeof block.filePath === "string" && typeof block.displayName === "string") {
      attachments.push({ type: "selection", filePath: block.filePath, displayName: block.displayName, ...block.selection ? { selection: block.selection } : {}, ...block.text ? { text: block.text } : {} });
    } else if ((block.type === "blob" || block.type === "image") && typeof block.data === "string" && typeof block.mimeType === "string") {
      attachments.push({ type: "blob", data: block.data, mimeType: block.mimeType, ...block.displayName ? { displayName: block.displayName } : {} });
    } else {
      throw sdkError("unsupported_prompt_block", `Copilot SDK cannot represent prompt block type '${block.type || "unknown"}'.`, 400);
    }
  }
  return { prompt: text.join(""), ...attachments.length ? { attachments } : {} };
}
var CopilotRuntime = class extends Runtime {
  constructor({
    model,
    timeoutMs = 45 * 60 * 1e3,
    quiesceTimeoutMs = DEFAULT_QUIESCE_TIMEOUT_MS,
    client,
    clientFactory,
    clientOptions = {},
    systemMessage,
    tools = [],
    availableTools,
    excludedTools,
    permissionPolicy,
    defaultPermissionDecision = "reject_once",
    ...legacyOptions
  } = {}) {
    super({ command: "copilot-sdk", unavailableCode: "copilot_unavailable", permissionPolicy, defaultPermissionDecision, ...legacyOptions });
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.quiesceTimeoutMs = quiesceTimeoutMs;
    this.client = client;
    this.clientFactory = clientFactory || ((options) => new CopilotClient2(options));
    this.clientOptions = clientOptions;
    this.systemMessage = systemMessage;
    this.tools = tools.map(normalizeTool);
    this.availableTools = availableTools;
    this.excludedTools = excludedTools;
    this.sessions = new SessionRegistry();
    this.sessionObjects = /* @__PURE__ */ new Map();
    this.turns = /* @__PURE__ */ new Map();
    this.commands = /* @__PURE__ */ new Map();
    this.pendingPermissions = /* @__PURE__ */ new Map();
    this.starting = null;
  }
  capabilities() {
    return {
      setModel: true,
      releaseSession: true,
      setMode: false,
      setPermissions: false,
      setGoal: false,
      compact: false,
      usage: false,
      steer: false,
      fork: false,
      listSessions: true,
      resume: true,
      streaming: true,
      richPrompt: true,
      availableCommands: false,
      fleetMode: false,
      scheduleRecurring: false,
      scheduleOnce: false,
      directTools: true,
      systemMessage: true
    };
  }
  async start() {
    if (this.ready) return this.info;
    if (this.starting) return this.starting;
    this.starting = (async () => {
      try {
        if (!this.client) this.client = await this.clientFactory(this.clientOptions);
        await this.client.start();
        this.ready = true;
        this.info = { backend: "copilot-sdk", sdkVersion: "1.0.13" };
        this.emit("ready", this.info);
        return this.info;
      } catch (error) {
        throw sdkError("copilot_unavailable", `Copilot SDK could not start: ${error.message}`, 503, error);
      }
    })();
    try {
      return await this.starting;
    } finally {
      this.starting = null;
    }
  }
  async models() {
    await this.start();
    const models = await this.client.listModels();
    return (models || []).map((model) => ({ ...model, modelId: model.modelId || model.id }));
  }
  #permissionResult(decision) {
    if (decision === "allow_once") return { kind: "approve-once" };
    if (decision === "allow_always") return { kind: "approve-for-session" };
    return { kind: "reject", feedback: decision === "cancel" ? "Floe cancelled this operation." : "Floe denied this operation." };
  }
  #manualPermission(request, normalized) {
    return new Promise((resolve6) => {
      const timer = setTimeout(() => {
        this.pendingPermissions.delete(normalized.id);
        resolve6(this.#permissionResult("reject_once"));
      }, this.unhandledRequestTimeoutMs);
      timer.unref?.();
      this.pendingPermissions.set(normalized.id, { resolve: resolve6, timer });
      this.emit("request", { id: normalized.id, method: "permission/request", params: normalized, raw: request });
    });
  }
  #permissionHandler() {
    return async (request, invocation = {}) => {
      const normalized = {
        runtime: "copilot",
        sessionId: invocation.sessionId || "",
        id: request.toolCallId || id("permission"),
        title: request.toolName || request.kind || "Permission requested",
        kind: request.kind || "tool",
        options: [
          { id: "approve", decision: "allow_once", label: "Allow once" },
          { id: "reject", decision: "reject_once", label: "Reject" }
        ],
        raw: request
      };
      if (this.listenerCount("request") > 0) return this.#manualPermission(request, normalized);
      let decision = this.defaultPermissionDecision;
      if (this.permissionPolicy) {
        try {
          decision = await this.permissionPolicy(normalized);
        } catch (error) {
          this.emit("diagnostic", `permissionPolicy threw; falling back to the default decision: ${error.message}`);
        }
      }
      return this.#permissionResult(decision);
    };
  }
  #sessionConfig(cwd, model, settings = {}, sessionId) {
    const systemMessage = settings.systemMessage || this.systemMessage;
    const config = {
      ...sessionId ? { sessionId } : {},
      model: model || void 0,
      workingDirectory: cwd,
      streaming: true,
      tools: [...this.tools, ...settings.tools || []].map(normalizeTool),
      availableTools: settings.availableTools ?? this.availableTools,
      excludedTools: settings.excludedTools ?? this.excludedTools,
      onPermissionRequest: this.#permissionHandler()
    };
    if (systemMessage) config.systemMessage = typeof systemMessage === "string" ? { mode: "append", content: systemMessage } : systemMessage;
    return config;
  }
  async #getSession(cwd, model, settings, continuation) {
    if (continuation.sessionId && this.sessionObjects.has(continuation.sessionId)) {
      const session2 = this.sessionObjects.get(continuation.sessionId);
      this.sessions.get(continuation.sessionId).stopped = true;
      return { session: session2, sessionId: continuation.sessionId, reused: true, reason: "Continuing the same session." };
    }
    if (continuation.sessionId && continuation.resumable !== false) {
      try {
        const session2 = await this.client.resumeSession(continuation.sessionId, this.#sessionConfig(cwd, model, settings, continuation.sessionId));
        this.sessionObjects.set(session2.sessionId, session2);
        this.sessions.set(session2.sessionId, { key: null, result: { sessionId: session2.sessionId } });
        return { session: session2, sessionId: session2.sessionId, reused: true, reason: "Resumed persisted session." };
      } catch (error) {
        this.emit("diagnostic", `Could not resume session ${continuation.sessionId}: ${error.message}`);
      }
    }
    const session = await this.client.createSession(this.#sessionConfig(cwd, model, settings));
    this.sessionObjects.set(session.sessionId, session);
    return { session, sessionId: session.sessionId, reused: false, reason: continuation.sessionId ? "The prior session was unavailable." : "A fresh session was requested." };
  }
  #publishStream(sessionId, task, kind, delta, raw) {
    this.publish(sessionId, "stream", { runtime: "copilot", sessionId, turnId: task.turnId, kind, delta, raw });
  }
  #handleEvent(sessionId, task, event) {
    const data = event?.data || {};
    task.lastActivity = Date.now();
    if (event.type === "assistant.turn_start" && data.turnId) task.turnId = data.turnId;
    if (event.type === "assistant.message_delta") {
      const delta = data.deltaContent || "";
      task.text += delta;
      this.#publishStream(sessionId, task, "text", delta, event);
    } else if (event.type === "assistant.message") {
      task.finalMessage = data.content;
      task.text = data.content || task.text;
      task.messageId = data.messageId || task.messageId;
      task.finishReason = data.finishReason || data.stopReason || task.finishReason;
    } else if (event.type === "assistant.reasoning_delta") {
      this.#publishStream(sessionId, task, "reasoning", data.deltaContent || "", event);
    } else if (event.type === "assistant.usage") {
      task.modelCalls.push({ ...data });
      task.usage = aggregateUsage(task.modelCalls, task.toolCallIds.size);
      this.publish(sessionId, "usage", { runtime: "copilot", sessionId, ...task.usage });
    } else if (event.type === "tool.execution_start") {
      task.items.push(data);
      task.toolCallIds.add(data.toolCallId);
      if (task.usage) task.usage = aggregateUsage(task.modelCalls, task.toolCallIds.size);
      task.activities.set(data.toolCallId, { title: data.toolName || data.toolCallId, startedAt: Date.now(), command: null });
      this.publish(sessionId, "activity", {
        runtime: "copilot",
        sessionId,
        turnId: task.turnId,
        id: data.toolCallId,
        kind: "tool",
        status: "started",
        title: data.toolName || data.toolCallId,
        command: null,
        startedAt: task.activities.get(data.toolCallId).startedAt,
        endedAt: null,
        raw: event
      });
    } else if (event.type === "tool.execution_complete") {
      task.items.push(data);
      const activity = task.activities.get(data.toolCallId) || { title: data.toolName || data.toolCallId, startedAt: Date.now(), command: null };
      task.activities.delete(data.toolCallId);
      this.publish(sessionId, "activity", {
        runtime: "copilot",
        sessionId,
        turnId: task.turnId,
        id: data.toolCallId,
        kind: "tool",
        status: data.success === false ? "failed" : "completed",
        title: activity.title,
        command: activity.command,
        startedAt: activity.startedAt,
        endedAt: Date.now(),
        raw: event
      });
    } else if (event.type === "session.error") {
      task.sessionError = data;
    } else if (event.type === "session.idle") {
      task.idle = true;
      task.aborted = data.aborted === true;
      this.#finishTask(sessionId, task);
    } else if (event.type === "model.call_failure") {
      task.modelCallFailure = data;
    }
  }
  #attach(sessionId, session, task) {
    return session.on((event) => this.#handleEvent(sessionId, task, event));
  }
  #finishTask(sessionId, task) {
    if (task.finished) return;
    task.finished = true;
    clearTimeout(task.timer);
    this.turns.delete(sessionId);
    this.sessions.markStopped(sessionId);
    task.unsubscribe?.();
    if (task.usage) task.usage = aggregateUsage(task.modelCalls, task.toolCallIds.size);
    const finish = task.finishReason;
    let error = null;
    if (task.aborted) error = sdkError("interrupted", "Turn was cancelled.", 409);
    else if (task.sessionError) error = sdkError("session_error", task.sessionError.message || "Copilot session failed.", 502);
    else if (task.modelCallFailure) error = sdkError("model_call_failure", task.modelCallFailure.message || "Copilot model call failed.", 502);
    else if (finish && !COMPLETE_FINISH_REASONS.has(finish)) error = sdkError("report_incomplete", `The Copilot response was not complete (finish reason: ${finish}).`, 502);
    if (error) {
      this.publish(sessionId, "turn", { runtime: "copilot", sessionId, turnId: task.turnId, phase: error.code === "interrupted" ? "interrupted" : "failed", stopReason: finish || error.code });
      task.reject(error);
    } else {
      try {
        const text = task.finalMessage ?? "";
        const report = task.schema ? extractStructuredOutput(text, task.schema, { role: task.role }) : text;
        const stopReason = finish || "end_turn";
        this.publish(sessionId, "turn", { runtime: "copilot", sessionId, turnId: task.turnId, phase: "completed", stopReason });
        task.resolve({ report, text, sessionId, turnId: task.turnId, stopReason, items: task.items, usage: task.usage, elapsedMs: Date.now() - task.started });
      } catch (caught) {
        this.publish(sessionId, "turn", { runtime: "copilot", sessionId, turnId: task.turnId, phase: "failed", stopReason: finish || "end_turn" });
        task.reject(caught);
      }
    }
    task.settle();
  }
  async run(role, input, cwd, onStart = () => {
  }, settings = {}, continuation = {}) {
    await this.start();
    const model = Object.hasOwn(settings, "model") ? settings.model : this.model;
    const sendOptions = promptOptions(input);
    const key = sessionKey({ role, cwd, model, settings, permissions: null, scope: continuation.scope });
    const destination = await this.#getSession(cwd, model, settings, continuation);
    const { session, sessionId, reused, reason } = destination;
    if (!this.sessions.has(sessionId)) this.sessions.set(sessionId, { key, result: { sessionId }, currentModelId: model || null });
    else this.sessions.get(sessionId).key = key;
    check(!this.turns.has(sessionId), "turn_busy", "The session already has an active turn.", 409);
    let resolveResult;
    let rejectResult;
    let settle;
    const completion = new Promise((resolve6, reject) => {
      resolveResult = resolve6;
      rejectResult = reject;
    });
    const settled = new Promise((resolve6) => {
      settle = resolve6;
    });
    const task = {
      role,
      schema: input.schema,
      started: Date.now(),
      turnId: id("turn"),
      items: [],
      text: "",
      finalMessage: null,
      finishReason: null,
      usage: null,
      modelCalls: [],
      toolCallIds: /* @__PURE__ */ new Set(),
      activities: /* @__PURE__ */ new Map(),
      resolve: resolveResult,
      reject: rejectResult,
      settle,
      settled,
      idle: false,
      abortRequested: false,
      finished: false,
      timer: null,
      lastActivity: Date.now()
    };
    task.timer = setTimeout(async () => {
      try {
        await this.interrupt(sessionId);
        await Promise.race([settled, new Promise((_, reject) => setTimeout(() => reject(sdkError("quiescence_unknown", "Copilot did not confirm quiescence after timeout.", 409)), this.quiesceTimeoutMs))]);
      } catch (error) {
        if (!task.finished) {
          task.finished = true;
          this.turns.delete(sessionId);
          rejectResult(error);
          settle();
        }
      }
    }, settings.timeoutMs || this.timeoutMs);
    task.unsubscribe = this.#attach(sessionId, session, task);
    this.turns.set(sessionId, task);
    this.publish(sessionId, "turn", { runtime: "copilot", sessionId, turnId: task.turnId, phase: "started" });
    try {
      await onStart(sessionId, { model: model || null, runtimeInstance: this, session: { action: reused ? "reused" : "fresh", reason } });
      await session.send(sendOptions);
    } catch (error) {
      if (!task.finished) {
        task.finished = true;
        clearTimeout(task.timer);
        this.turns.delete(sessionId);
        task.unsubscribe?.();
        const fault = typeof error?.code === "string" ? error : sdkError("model_call_failure", `Copilot model call failed: ${error.message}`, 502, error);
        this.publish(sessionId, "turn", {
          runtime: "copilot",
          sessionId,
          turnId: task.turnId,
          phase: fault.code === "interrupted" ? "interrupted" : "failed",
          stopReason: fault.code
        });
        rejectResult(fault);
        settle();
      }
    }
    return completion;
  }
  async setModel(sessionId, modelId) {
    const session = this.sessionObjects.get(sessionId);
    check(session, "session_unavailable", `Copilot session '${sessionId}' is unavailable.`, 404);
    await session.setModel(modelId);
    const record = this.sessions.get(sessionId);
    if (record) record.currentModelId = modelId;
  }
  respond(requestId, result2) {
    const pending = this.pendingPermissions.get(String(requestId));
    if (!pending) return super.respond(requestId, result2);
    this.pendingPermissions.delete(String(requestId));
    clearTimeout(pending.timer);
    const selected = result2?.outcome?.optionId || result2?.decision || result2;
    pending.resolve(this.#permissionResult(selected === "allow" ? "allow_once" : selected === "reject" ? "reject_once" : selected));
  }
  respondError(requestId, message, code) {
    const pending = this.pendingPermissions.get(String(requestId));
    if (!pending) return super.respondError(requestId, message, code);
    this.pendingPermissions.delete(String(requestId));
    clearTimeout(pending.timer);
    pending.resolve(this.#permissionResult("reject_once"));
  }
  async interrupt(sessionId) {
    const task = this.turns.get(sessionId);
    if (!task) return;
    task.abortRequested = true;
    await this.sessionObjects.get(sessionId)?.abort();
  }
  async quiesce(sessionId) {
    const task = this.turns.get(sessionId);
    if (!task) {
      this.sessions.markStopped(sessionId);
      return;
    }
    await this.interrupt(sessionId);
    try {
      await Promise.race([task.settled, new Promise((_, reject) => setTimeout(() => reject(sdkError("quiescence_unknown", "Copilot did not emit session.idle after abort.", 409)), this.quiesceTimeoutMs))]);
    } finally {
      if (!this.turns.has(sessionId)) this.sessions.markStopped(sessionId);
    }
  }
  async retire(sessionId) {
    const session = this.sessionObjects.get(sessionId);
    if (!session) return { status: "unavailable" };
    check(!this.turns.has(sessionId), "quiescence_unknown", "Confirm the assignment stopped before retiring its session.", 409);
    await session.disconnect();
    this.sessionObjects.delete(sessionId);
    this.sessions.delete(sessionId);
    return { status: "retiredLocally" };
  }
  async resume(sessionId, cwd) {
    await this.start();
    const session = await this.client.resumeSession(sessionId, this.#sessionConfig(cwd, this.model, {}, sessionId));
    this.sessionObjects.set(sessionId, session);
    this.sessions.set(sessionId, { key: null, result: { sessionId } });
    return sessionId;
  }
  async setMode() {
    unsupported("copilot", "setMode");
  }
  async setPermissions() {
    unsupported("copilot", "setPermissions");
  }
  async setGoal() {
    unsupported("copilot", "setGoal");
  }
  async compact() {
    unsupported("copilot", "compact");
  }
  async usage() {
    unsupported("copilot", "usage");
  }
  async steer() {
    unsupported("copilot", "steer");
  }
  async fork() {
    unsupported("copilot", "fork");
  }
  async listSessions() {
    await this.start();
    return this.client.listSessions();
  }
  availableCommands() {
    unsupported("copilot", "availableCommands");
  }
  async sweepOrphans() {
    return { swept: [], checked: 0 };
  }
  async onClosing() {
    for (const sessionId of this.turns.keys()) await this.interrupt(sessionId).catch(() => {
    });
    for (const session of this.sessionObjects.values()) await session.disconnect().catch(() => {
    });
  }
  async close() {
    await this.onClosing();
    if (this.client) await this.client.stop();
    this.sessionObjects.clear();
    this.sessions.clear();
    for (const pending of this.pendingPermissions.values()) {
      clearTimeout(pending.timer);
      pending.resolve(this.#permissionResult("reject_once"));
    }
    this.pendingPermissions.clear();
    this.ready = false;
    this.client = null;
  }
};

// floe-bridge/dist/runtime-core/guidance.js
var SUBSTRATE_GUIDANCE = readPromptAsset("substrate-guidance.md");
function buildSystemPrompt(agentInstructions) {
  if (!agentInstructions.trim()) {
    return SUBSTRATE_GUIDANCE;
  }
  return `${agentInstructions.trim()}

${SUBSTRATE_GUIDANCE}`;
}
function renderDestinationContext(context) {
  const lines = [
    `[Context Envelope]`,
    `context: ${context.current_context_id ?? "unavailable"}`,
    `cause_actor: ${toNeutralRef(context.source_endpoint_id)}`
  ];
  if (context.cause_type)
    lines.push(`cause_type: ${context.cause_type}`);
  if (context.cause_event_id)
    lines.push(`cause_event: ${context.cause_event_id}`);
  if (context.cause_reference)
    lines.push(`reference: ${context.cause_reference}`);
  lines.push("history: available on demand with context_history");
  return lines.join("\n");
}

// floe-bridge/dist/runtime-core/delivery-prompt.js
function eventAttachments(content, versionIds) {
  const value = content?.attachments;
  const descriptions = (Array.isArray(value) ? value : []).slice(0, 10).flatMap((item) => {
    if (!item || typeof item !== "object")
      return [];
    const candidate = item;
    if (typeof candidate.artefact_version_id !== "string" || !candidate.artefact_version_id.trim() || typeof candidate.name !== "string")
      return [];
    return [{
      artefact_version_id: candidate.artefact_version_id,
      name: candidate.name.slice(0, 200),
      media_type: typeof candidate.media_type === "string" ? candidate.media_type.slice(0, 100) : "application/octet-stream",
      bytes: typeof candidate.bytes === "number" ? candidate.bytes : null
    }];
  });
  return [...new Set(versionIds ?? descriptions.map((item) => item.artefact_version_id))].slice(0, 10).map((id2) => descriptions.find((item) => item.artefact_version_id === id2) ?? {
    artefact_version_id: id2,
    name: id2,
    media_type: "application/octet-stream",
    bytes: null
  });
}
function eventContentToPrompt(content, versionIds) {
  const attachments = eventAttachments(content, versionIds);
  const text = typeof content?.text === "string" ? content.text : "";
  const remaining = Object.fromEntries(Object.entries(content ?? {}).filter(([key]) => key !== "text" && key !== "attachments"));
  const parts = [];
  if (text)
    parts.push(text);
  if (text && Array.isArray(content?.references) && content.references.length) {
    parts.push(`[Named references]
${JSON.stringify(content.references)}
References identify records to inspect under your current authority; they do not prove the record's state.
[End named references]`);
  }
  if (!text && Object.keys(remaining).length > 0)
    parts.push(JSON.stringify(remaining));
  if (attachments.length > 0) {
    parts.push([
      "[Attached ArtefactVersions]",
      "Use read_artefact with the exact artefact_version_id to inspect shared content when relevant. Images are loaded into your model context only when read.",
      ...attachments.map((attachment) => `- ${attachment.name} (${attachment.media_type}${attachment.bytes == null ? "" : `, ${attachment.bytes} bytes`}): ${attachment.artefact_version_id}`),
      "[End attached ArtefactVersions]"
    ].join("\n"));
  }
  return parts.join("\n\n") || JSON.stringify(content ?? {});
}
function deliveryToPrompt(bundle) {
  const trigger = bundle.events[0];
  const returnedBy = typeof trigger?.metadata?.responding_endpoint_id === "string" ? trigger.metadata.responding_endpoint_id : null;
  const sourceEndpoint = trigger?.source_endpoint_id || returnedBy || `actor:${bundle.workspace_id}:system`;
  const currentContextId = bundle.context_id ?? trigger?.context_id ?? null;
  const requestReference = typeof trigger?.metadata?.request_event_id === "string" ? trigger.metadata.request_event_id : null;
  const contextBlock = renderDestinationContext({
    source_endpoint_id: sourceEndpoint,
    current_context_id: currentContextId,
    cause_event_id: trigger?.event_id ?? null,
    cause_type: trigger?.type ?? null,
    cause_reference: requestReference ? `request ${requestReference}` : null
  });
  const contract = bundle.processing_contract;
  const scopeBlock = contract?.contract_kind === "scope_node" ? [
    "[Current Scope execution]",
    `scope: ${contract.scope_execution.scope_id}`,
    `execution: ${contract.scope_execution.execution_id}`,
    `composition_revision: ${contract.scope_execution.revision_id}`,
    `node_execution: ${contract.node_execution.node_execution_id}`,
    `attempt: ${contract.execution_attempt.attempt_id}`,
    `publish_operation: ${contract.outputs.publish_operation_id}`,
    `output_ports: ${JSON.stringify(contract.outputs.ports.map((port) => ({
      port_id: port.port_id,
      name: port.name,
      event_types: port.event_types,
      artefact_types: port.artefact_types,
      schema_ref: port.schema_ref,
      min_count: port.min_count,
      max_count: port.max_count
    })))}`,
    "These are the current work references. Source references in inputs describe history. Read the target's current resource revision through capability discovery before changing it."
  ].join("\n") : "";
  const eventLines = bundle.events.map((event) => {
    const text = eventContentToPrompt(event.content, event.artefact_version_ids);
    return `[Input ${event.event_id} / ${event.type}]
${text}`;
  }).filter((t) => t.length > 0);
  const eventsBlock = eventLines.join("\n\n");
  return [contextBlock, scopeBlock, eventsBlock].filter(Boolean).join("\n\n");
}

// floe-bridge/dist/runtime-core/hook-injections.js
var MAX_INJECTION_CHARS = 4e3;
var MAX_TOTAL_INJECTION_CHARS = 16e3;
function renderHookInjections(results) {
  const injections = results.filter((r) => r.inject != null).map((r) => r.inject);
  if (injections.length === 0)
    return "";
  const lines = ["[Injected Context \u2014 extension-provided, not a message]"];
  let totalChars = 0;
  for (const injection of injections) {
    const source = typeof injection.source === "string" ? injection.source : "extension";
    const content = typeof injection.content === "string" ? injection.content : JSON.stringify(injection, null, 2);
    const bounded = content.length > MAX_INJECTION_CHARS ? content.slice(0, MAX_INJECTION_CHARS) + `
... (truncated from ${content.length} chars)` : content;
    if (totalChars + bounded.length > MAX_TOTAL_INJECTION_CHARS) {
      lines.push(`
[injection truncated \u2014 total limit reached]`);
      break;
    }
    lines.push(`
--- from: ${source} ---`);
    lines.push(bounded);
    totalChars += bounded.length;
  }
  lines.push("\n[End Injected Context]");
  return lines.join("\n");
}

// floe-bridge/dist/runtime-core/substrate-authority.js
async function requireOperationAuthority(bus, turn) {
  if (!turn.delivery_id) {
    throw new Error("No active Delivery is bound to this substrate tool call.");
  }
  let session = turn.operation_authority_session;
  const expiresAt = session ? Date.parse(session.expires_at) : Number.NaN;
  if (!session || !Number.isFinite(expiresAt) || expiresAt <= Date.now() + 6e4) {
    const prepared = await bus.prepareRuntimeDelivery(turn.delivery_id);
    if (turn.processing_contract_id && prepared.processing_contract.processing_contract_id !== turn.processing_contract_id) {
      throw new Error("Runtime preparation returned a different immutable processing contract for the active Delivery.");
    }
    session = prepared.operation_authority_session;
    turn.operation_authority_session = session;
    turn.processing_contract_id = prepared.processing_contract.processing_contract_id;
  }
  return session;
}

// floe-bridge/dist/runtime-core/substrate-capability-tools.js
import { randomUUID as randomUUID4 } from "node:crypto";
function failure(message, error, details = {}) {
  return {
    content: [{ type: "text", text: message }],
    details: { ok: false, error, ...details }
  };
}
function parseTarget(value) {
  if (!value || typeof value !== "object")
    return null;
  const record = value;
  const kind = typeof record.kind === "string" ? record.kind.trim() : "";
  const id2 = typeof record.id === "string" ? record.id.trim() : "";
  return kind && id2 ? { kind, id: id2 } : null;
}
async function executeDiscoverCapabilities(bus, workspaceId, turn, params) {
  try {
    const authority = await requireOperationAuthority(bus, turn);
    const operationId = typeof params?.operation_id === "string" ? params.operation_id.trim() : "";
    const result2 = await bus.discoverOperations(workspaceId, authority.bearer_token, {
      query: operationId || (typeof params?.query === "string" ? params.query : void 0),
      category: operationId ? void 0 : typeof params?.category === "string" ? params.category : void 0,
      target: parseTarget(params?.target)
    });
    const limit = typeof params?.limit === "number" ? Math.max(1, Math.min(20, Math.trunc(params.limit))) : 20;
    const matches = operationId ? result2.operations.filter((operation) => operation.operation_id === operationId) : result2.operations;
    const operations = matches.slice(0, limit);
    const text = operations.length === 0 ? operationId ? `Operation '${operationId}' is not exposed for this Delivery and target. Search current capabilities before choosing another operation.` : "No semantic operation matched that need for this Delivery. Try a shorter outcome-oriented query before concluding that the operation is unavailable." : operationId ? renderOperation(operations[0], params?.include_result_schema === true) : `${operations.map(renderOperationSummary).join("\n\n")}

Showing ${operations.length} of ${matches.length} matches. Load the needed input contract with discover_capabilities({operation_id: "..."}). Narrow query or category if needed.`;
    return {
      content: [{ type: "text", text }],
      details: { ok: true, mode: operationId ? "contract" : "summary", match_count: matches.length, operations }
    };
  } catch (error) {
    return failure(`Could not discover operations: ${error instanceof Error ? error.message : String(error)}`, "operation_discovery_failed");
  }
}
async function executeUseCapability(bus, workspaceId, turn, params) {
  const operationId = String(params?.operation_id ?? "").trim();
  const operationVersion = String(params?.operation_version ?? "").trim();
  const inputSchemaVersion = String(params?.input_schema_version ?? "").trim();
  if (!operationId || !operationVersion || !inputSchemaVersion) {
    return failure("The exact discovered operation_id, operation_version, and input_schema_version are required.", "operation_contract_required");
  }
  try {
    const authority = await requireOperationAuthority(bus, turn);
    const idempotencyKey = typeof params?.idempotency_key === "string" && params.idempotency_key.trim() ? params.idempotency_key.trim() : `runtime:${turn.delivery_id}:${randomUUID4()}`;
    const response = await bus.invokeOperation(workspaceId, authority.bearer_token, {
      operation_id: operationId,
      operation_version: operationVersion,
      input_schema_version: inputSchemaVersion,
      target: parseTarget(params?.target),
      expected_resource_revision: typeof params?.expected_resource_revision === "string" ? params.expected_resource_revision : null,
      idempotency_key: idempotencyKey,
      input: params?.input && typeof params.input === "object" ? params.input : {}
    });
    return renderInvocation(response, operationId);
  } catch (error) {
    return failure(`Could not invoke operation '${operationId}': ${error instanceof Error ? error.message : String(error)}`, "operation_invocation_failed", { operation_id: operationId });
  }
}
function renderOperationSummary(operation) {
  const availability = operation.availability.available ? "available" : `unavailable \u2014 ${operation.availability.refusal.code}: ${operation.availability.refusal.message}`;
  return [
    `operation_id: ${operation.operation_id}
operation_version: ${operation.operation_version}
${operation.title}`,
    operation.description,
    `Availability: ${availability}`,
    `Target: ${JSON.stringify(operation.target)}`,
    `Effects: ${operation.effects.mode}, ${operation.effects.reversibility}${operation.effects.external ? ", external" : ""}`,
    `Category: ${operation.category}`
  ].join("\n");
}
function renderOperation(operation, includeResultSchema) {
  return [
    renderOperationSummary(operation),
    `Input schema ${operation.input.version}: ${JSON.stringify(operation.input.schema)}`,
    ...includeResultSchema ? [`Result schema ${operation.result.version}: ${JSON.stringify(operation.result.schema)}`] : []
  ].join("\n");
}
function renderInvocation(response, operationId) {
  if (response.kind === "rejected") {
    return failure(renderRefusal(response.refusal), response.refusal.code, {
      operation_id: operationId,
      refusal: response.refusal
    });
  }
  if (response.kind === "conflict") {
    return failure(renderRefusal(response.refusal, response.existing_receipt.receipt_id), response.refusal.code, {
      operation_id: operationId,
      refusal: response.refusal,
      existing_receipt: response.existing_receipt
    });
  }
  const { receipt } = response;
  if (receipt.state === "refused" && receipt.refusal) {
    return failure(renderRefusal(receipt.refusal, receipt.receipt_id), receipt.refusal.code, {
      operation_id: operationId,
      receipt
    });
  }
  const renderedResult = JSON.stringify({
    ...receipt.state === "awaiting_approval" ? {
      refusal: receipt.refusal,
      approval_request_ids: receipt.governance.approval_request_ids,
      retry: {
        operation_id: receipt.operation_id,
        operation_version: receipt.operation_version,
        idempotency_key: receipt.idempotency_key,
        expected_resource_revision: receipt.expected_resource_revision
      }
    } : {},
    ...receipt.result === null ? {} : { result: receipt.result },
    ...receipt.target ? { target: receipt.target } : {},
    ...Array.isArray(receipt.changed_refs) && receipt.changed_refs.length ? { changed_refs: receipt.changed_refs } : {},
    ...receipt.progress_ref ? { progress_ref: receipt.progress_ref } : {},
    ...receipt.cancel_ref ? { cancel_ref: receipt.cancel_ref } : {},
    ...receipt.audit_ref ? { audit_ref: receipt.audit_ref } : {}
  });
  return {
    content: [{
      type: "text",
      text: `Operation '${operationId}' ${receipt.state}. Receipt: ${receipt.receipt_id}

${renderedResult}`
    }],
    details: { ok: true, operation_id: operationId, replayed: response.replayed, receipt }
  };
}
function renderRefusal(refusal, receiptId) {
  return `${refusal.message}

${JSON.stringify({
    code: refusal.code,
    retryable: refusal.retryable,
    required_action: refusal.required_action,
    details: refusal.details,
    ...receiptId ? { receipt_id: receiptId } : {}
  })}`;
}

// floe-bridge/dist/runtime-core/substrate-pulse-tools.js
var ISO_DURATION_RE = /^p(?:t)?(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/i;
var NATURAL_RELATIVE_RE = /^(?:in\s+)?(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours)(?:\s*(?:from\s+now|later))?$/i;
function failure2(message, error, details = {}) {
  return { content: [{ type: "text", text: message }], details: { ok: false, error, ...details } };
}
function finiteRelativeSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0)
    return null;
  const maxRelativeSeconds = (864e13 - Date.now()) / 1e3;
  return seconds <= maxRelativeSeconds ? seconds : null;
}
function isRelativeExpression(input) {
  const value = input.trim().toLowerCase();
  return ISO_DURATION_RE.test(value) || NATURAL_RELATIVE_RE.test(value);
}
function relativeSeconds(input) {
  if (typeof input === "number")
    return finiteRelativeSeconds(input);
  if (typeof input !== "string")
    return null;
  const value = input.trim().toLowerCase();
  if (!value)
    return null;
  const isoDuration = value.match(ISO_DURATION_RE);
  if (isoDuration && (isoDuration[1] || isoDuration[2] || isoDuration[3])) {
    const hours = Number(isoDuration[1] ?? 0);
    const minutes = Number(isoDuration[2] ?? 0);
    const seconds = Number(isoDuration[3] ?? 0);
    return finiteRelativeSeconds(hours * 3600 + minutes * 60 + seconds);
  }
  const natural = value.match(NATURAL_RELATIVE_RE);
  if (!natural)
    return null;
  const amount = Number(natural[1]);
  if (!Number.isFinite(amount) || amount <= 0)
    return null;
  const unit = natural[2];
  if (["s", "sec", "secs", "second", "seconds"].includes(unit))
    return finiteRelativeSeconds(amount);
  if (["m", "min", "mins", "minute", "minutes"].includes(unit))
    return finiteRelativeSeconds(amount * 60);
  return finiteRelativeSeconds(amount * 3600);
}
function isoFromNow(seconds) {
  return new Date(Date.now() + Math.round(seconds * 1e3)).toISOString();
}
function normalizeOnceAt(raw) {
  const at = typeof raw.at === "string" ? raw.at.trim() : "";
  if (at) {
    const seconds = relativeSeconds(at);
    if (seconds !== null)
      return isoFromNow(seconds);
    return isRelativeExpression(at) ? void 0 : at;
  }
  for (const field of ["after_seconds", "delay_seconds", "in_seconds", "seconds_from_now", "after"]) {
    const seconds = relativeSeconds(raw[field]);
    if (seconds !== null)
      return isoFromNow(seconds);
  }
  return void 0;
}
function normalizePulseTrigger(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "trigger must be an object with type 'once' or 'cron'." };
  }
  const raw = input;
  const rawType = typeof raw.type === "string" ? raw.type.trim().toLowerCase() : "";
  const schedule = typeof raw.schedule === "string" ? raw.schedule : void 0;
  const timezone = typeof raw.timezone === "string" ? raw.timezone : void 0;
  if (rawType === "cron") {
    if (!schedule)
      return { error: "cron pulses require trigger.schedule." };
    return { type: "cron", schedule, timezone };
  }
  const onceAliases = /* @__PURE__ */ new Set(["once", "one-off", "one_off", "oneoff", "at", "at_time", "at_time_utc", "datetime", "time"]);
  if (rawType === "" || onceAliases.has(rawType)) {
    const at = normalizeOnceAt(raw);
    if (!at)
      return { error: "one-off pulses require trigger.at or trigger.after_seconds." };
    return { type: "once", at, timezone };
  }
  return { error: `Unsupported trigger.type '${rawType}'. Use 'once' with trigger.at or 'cron' with trigger.schedule.` };
}
function normalizePulseSubscribers(input) {
  if (!Array.isArray(input))
    return [];
  const subscribers = [];
  for (const item of input) {
    if (!item || typeof item !== "object" || Array.isArray(item))
      return { error: "subscribers must contain objects." };
    const raw = item;
    const kind = typeof raw.kind === "string" ? raw.kind.trim().toLowerCase() : "";
    if (kind === "context") {
      if (typeof raw.context_id !== "string" || !raw.context_id.trim())
        return { error: "context subscribers require context_id." };
      subscribers.push({ kind: "context", context_id: raw.context_id });
      continue;
    }
    if (kind === "" || kind === "endpoint") {
      if (typeof raw.endpoint_ref !== "string" || !raw.endpoint_ref.trim())
        return { error: "endpoint subscribers require endpoint_ref." };
      subscribers.push({
        kind: "endpoint",
        endpoint_ref: raw.endpoint_ref,
        context_id: typeof raw.context_id === "string" ? raw.context_id : void 0
      });
      continue;
    }
    return { error: `Unsupported subscriber.kind '${kind}'. Use 'context' or 'endpoint'.` };
  }
  return subscribers;
}
function resolvedScopeIdFromCreatePulseResult(result2) {
  const candidate = result2 && typeof result2 === "object" && "pulse" in result2 ? result2.pulse : result2;
  if (!candidate || typeof candidate !== "object")
    return void 0;
  const scopeId = candidate.scope_id;
  return typeof scopeId === "string" && scopeId ? scopeId : void 0;
}
async function writePulseToFloeYaml(workspaceLocator, pulseDef) {
  const { readFileSync: readFileSync7, writeFileSync: writeFileSync5 } = await import("node:fs");
  const { join: join8 } = await import("node:path");
  const YAML3 = (await import("./dist-BSYBXLJX.js")).default;
  const yamlPath = join8(workspaceLocator, ".floe", "floe.yaml");
  const doc = YAML3.parseDocument(readFileSync7(yamlPath, "utf8"));
  if (!doc.get("pulses"))
    doc.set("pulses", doc.createNode([]));
  const entry = {
    id: pulseDef.pulse_id,
    persistence: pulseDef.persistence,
    trigger: pulseDef.trigger,
    event: pulseDef.event
  };
  if (pulseDef.scope_id)
    entry.scope_id = pulseDef.scope_id;
  if (pulseDef.subscribers.length > 0)
    entry.subscribers = pulseDef.subscribers;
  doc.get("pulses").add(doc.createNode(entry));
  writeFileSync5(yamlPath, doc.toString(), "utf8");
}
async function executeCreatePulse(bus, turn, params) {
  if (params?.persistence !== void 0 && params.persistence !== "workspace" && params.persistence !== "local") {
    return failure2("Cannot create pulse: use persistence 'workspace' or 'local'.", "invalid_persistence");
  }
  const persistence = params?.persistence === "workspace" ? "workspace" : "local";
  const scopeId = typeof params?.scope_id === "string" && params.scope_id.trim() ? params.scope_id : void 0;
  const pulseId = typeof params?.pulse_id === "string" ? params.pulse_id.trim() : "";
  if (!pulseId)
    return failure2("Cannot create pulse: a unique pulse_id is required.", "invalid_pulse_id");
  const trigger = normalizePulseTrigger(params?.trigger);
  if ("error" in trigger)
    return failure2(`Cannot create pulse: ${trigger.error}`, "invalid_trigger", { message: trigger.error });
  const subscribers = normalizePulseSubscribers(params?.subscribers);
  if ("error" in subscribers)
    return failure2(`Cannot create pulse: ${subscribers.error}`, "invalid_subscribers", { message: subscribers.error });
  const eventContent = params?.event && typeof params.event === "object" && params.event.content && typeof params.event.content === "object" ? params.event.content : params?.content && typeof params.content === "object" ? params.content : {};
  try {
    const result2 = await bus.createPulse({
      pulse_id: pulseId,
      workspace_id: turn.workspace_id,
      persistence,
      scope_id: scopeId,
      current_context_id: turn.context_id ?? void 0,
      trigger,
      event: { type: "pulse.fired", content: eventContent },
      content: eventContent,
      subscribers,
      created_by: "actor"
    });
    const resolvedScopeId = scopeId ?? resolvedScopeIdFromCreatePulseResult(result2);
    if (persistence === "workspace" && turn.workspace_locator) {
      try {
        await writePulseToFloeYaml(turn.workspace_locator, {
          pulse_id: pulseId,
          persistence,
          scope_id: resolvedScopeId,
          trigger,
          event: { type: "pulse.fired", content: eventContent },
          subscribers
        });
      } catch (err) {
        console.error("[bridge] pulse write-back to floe.yaml failed", { pulse_id: pulseId, error: err });
      }
    }
    return {
      content: [{
        type: "text",
        text: `Pulse '${pulseId}' created (persistence: ${persistence}${resolvedScopeId ? `, scope_id: ${resolvedScopeId}` : ""}).
${JSON.stringify(result2, null, 2)}`
      }],
      details: { ok: true, pulse_id: pulseId, persistence, scope_id: resolvedScopeId }
    };
  } catch (error) {
    return failure2(`Could not create pulse '${pulseId}': ${error instanceof Error ? error.message : String(error)}`, "pulse_create_failed", { pulse_id: pulseId });
  }
}
async function executeListPulses(bus, turn, params) {
  try {
    const result2 = await bus.listPulses({
      workspace_id: turn.workspace_id,
      status: typeof params?.status === "string" && params.status.trim() ? params.status.trim() : void 0
    });
    const pulses = result2.pulses ?? [];
    return {
      content: [{ type: "text", text: pulses.length === 0 ? "No pulses found for this workspace." : JSON.stringify(pulses, null, 2) }],
      details: { ok: true, count: pulses.length }
    };
  } catch (error) {
    return failure2(`Could not list pulses: ${error instanceof Error ? error.message : String(error)}`, "pulse_list_failed");
  }
}
async function transitionPulse(bus, params, verb, call) {
  const pulseId = typeof params?.pulse_id === "string" ? params.pulse_id.trim() : "";
  if (!pulseId)
    return failure2(`Cannot ${verb} pulse: the pulse_id is required.`, "invalid_pulse_id");
  try {
    const result2 = await call(bus, pulseId);
    const past = verb === "cancel" ? "cancelled" : `${verb}d`;
    return {
      content: [{ type: "text", text: `Pulse '${pulseId}' ${past}.
${JSON.stringify(result2, null, 2)}` }],
      details: { ok: true, pulse_id: pulseId }
    };
  } catch (error) {
    return failure2(`Could not ${verb} pulse '${pulseId}': ${error instanceof Error ? error.message : String(error)}`, `pulse_${verb}_failed`, { pulse_id: pulseId });
  }
}
function executePausePulse(bus, params) {
  return transitionPulse(bus, params, "pause", (b, id2) => b.pausePulse(id2));
}
function executeResumePulse(bus, params) {
  return transitionPulse(bus, params, "resume", (b, id2) => b.resumePulse(id2));
}
function executeCancelPulse(bus, params) {
  return transitionPulse(bus, params, "cancel", (b, id2) => b.cancelPulse(id2));
}

// floe-bridge/dist/runtime-core/substrate-artefact-tools.js
import { createHash as createHash3 } from "node:crypto";
var IMAGE_TYPES = /* @__PURE__ */ new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
var MAX_TEXT_UNITS = 16e3;
function failure3(message, versionId) {
  return {
    content: [{ type: "text", text: `Could not read shared content: ${message}` }],
    details: { ok: false, error: "artefact_content_read_failed", artefact_version_id: versionId }
  };
}
async function executeReadArtefact(bus, turn, params) {
  const versionId = typeof params?.artefact_version_id === "string" ? params.artefact_version_id.trim() : "";
  try {
    if (!versionId)
      throw new Error("An exact artefact_version_id is required.");
    const offset = params?.offset ?? 0;
    const limit = params?.limit ?? MAX_TEXT_UNITS;
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_TEXT_UNITS) {
      throw new Error(`Text offset must be a nonnegative integer and limit must be between 1 and ${MAX_TEXT_UNITS}.`);
    }
    const authority = await requireOperationAuthority(bus, turn);
    const { bytes, media_type } = await bus.readArtefactVersionContent(turn.workspace_id, versionId, authority.bearer_token);
    const details = { artefact_version_id: versionId, media_type, bytes: bytes.byteLength };
    if (IMAGE_TYPES.has(media_type)) {
      if (offset !== 0 || params?.limit !== void 0) {
        throw new Error("Text paging does not apply to images. Omit offset and limit to inspect the image.");
      }
      return {
        content: [
          { type: "text", text: `Image from exact ArtefactVersion ${versionId}` },
          { type: "image", data: bytes.toString("base64"), mimeType: media_type }
        ],
        details: { ok: true, ...details }
      };
    }
    if (media_type.startsWith("text/") || /(?:json|xml|yaml)$/.test(media_type)) {
      const text = bytes.toString("utf8");
      if (offset > text.length)
        throw new Error(`Text offset exceeds the saved text length (${text.length}).`);
      const splitsCharacter = (at) => at > 0 && at < text.length && /[\uD800-\uDBFF]/.test(text[at - 1]) && /[\uDC00-\uDFFF]/.test(text[at]);
      if (splitsCharacter(offset))
        throw new Error("Text offset splits a Unicode character. Use the preceding page's next_offset.");
      let end = Math.min(text.length, offset + limit);
      if (splitsCharacter(end))
        end = end - 1 === offset ? end + 1 : end - 1;
      const nextOffset = end < text.length ? end : null;
      let firstLine = 1;
      for (let at = text.indexOf("\n"); at >= 0 && at < offset; at = text.indexOf("\n", at + 1))
        firstLine++;
      const page = { offset, returned_units: end - offset, total_units: text.length, first_line: firstLine, next_offset: nextOffset };
      const digest2 = { algorithm: "sha256", value: createHash3("sha256").update(bytes).digest("hex") };
      return {
        content: [
          {
            type: "text",
            text: `Exact saved text: ${JSON.stringify({ ...details, digest: digest2, ...page })}${nextOffset === null ? "\nEnd of saved text." : `
Continue this version with offset: ${nextOffset}.`}`
          },
          { type: "text", text: text.slice(offset, end) }
        ],
        details: { ok: true, ...details, digest: digest2, ...page, truncated: nextOffset !== null }
      };
    }
    return {
      content: [{ type: "text", text: `Cannot present ${media_type} directly to the model. Discover a capability that can inspect this exact ArtefactVersion: ${versionId}.` }],
      details: { ok: false, error: "unsupported_model_content", ...details }
    };
  } catch (error) {
    return failure3(error instanceof Error ? error.message : String(error), versionId);
  }
}

// floe-bridge/dist/runtime-core/worklog.js
import { existsSync as existsSync7, mkdirSync as mkdirSync5, appendFileSync } from "node:fs";
import { join as join6 } from "node:path";
function appendWorkLog(workspaceLocator, entry) {
  const date = entry.started_at.slice(0, 10);
  const dir = join6(workspaceLocator, ".floe", "agents", entry.agent_id, "worklogs");
  if (!existsSync7(dir)) {
    mkdirSync5(dir, { recursive: true });
  }
  const filePath = join6(dir, `${date}.md`);
  const markdown = renderWorkLogEntry(entry);
  appendFileSync(filePath, markdown, "utf-8");
}
function renderWorkLogEntry(entry) {
  const lines = [];
  lines.push(`## Turn ${entry.runtime_turn_id}`);
  lines.push("");
  lines.push(`**Started:** ${entry.started_at}`);
  lines.push(`**Ended:** ${entry.ended_at}`);
  lines.push(`**Trigger:** ${entry.trigger_type}`);
  lines.push(`**Scope:** ${entry.scope_id ?? "(unscoped)"}`);
  lines.push(`**Thread:** ${entry.thread_id}`);
  lines.push(`**Delivery:** ${entry.delivery_id}`);
  lines.push("");
  lines.push("### Delivered events");
  if (entry.delivered_events.length === 0) {
    lines.push("- (none)");
  } else {
    for (const evt of entry.delivered_events) {
      const preview = evt.text.length > 120 ? evt.text.slice(0, 120) + "\u2026" : evt.text;
      lines.push(`- [${evt.type}] from ${evt.source_endpoint_id}: ${preview}`);
    }
  }
  lines.push("");
  lines.push("### Runtime notes / visible output");
  if (entry.visible_output && entry.visible_output.trim()) {
    lines.push("");
    lines.push(entry.visible_output.trim());
  } else {
    lines.push("(no visible output)");
  }
  lines.push("");
  lines.push("### Tool activity");
  if (entry.tool_activity.length === 0) {
    lines.push("- (none)");
  } else {
    for (const tool of entry.tool_activity) {
      const status = tool.is_error ? " \u274C" : "";
      const summary = tool.summary ? `: ${tool.summary}` : "";
      const duration = tool.duration_ms != null ? ` (${tool.duration_ms}ms)` : "";
      const lifecycle = tool.lifecycle ? ` [${tool.lifecycle}]` : "";
      lines.push(`- ${tool.name}${lifecycle}${summary}${duration}${status}`);
      if (tool.files_touched && tool.files_touched.length > 0) {
        for (const file of tool.files_touched) {
          lines.push(`  - \u{1F4C4} ${file}`);
        }
      }
    }
  }
  lines.push("");
  lines.push("### Emitted events");
  if (entry.emitted_events.length === 0) {
    lines.push("- (none \u2014 no explicit communication)");
  } else {
    for (const emit of entry.emitted_events) {
      const preview = emit.text_preview.length > 80 ? emit.text_preview.slice(0, 80) + "\u2026" : emit.text_preview;
      lines.push(`- [${emit.type}] \u2192 ${emit.destination}: ${preview}`);
    }
  }
  lines.push("");
  lines.push(`### Outcome`);
  lines.push(`${entry.lifecycle_outcome}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}

// node_modules/zod-to-json-schema/dist/esm/Options.js
var ignoreOverride = /* @__PURE__ */ Symbol("Let zodToJsonSchema decide on which parser to use");
var defaultOptions = {
  name: void 0,
  $refStrategy: "root",
  basePath: ["#"],
  effectStrategy: "input",
  pipeStrategy: "all",
  dateStrategy: "format:date-time",
  mapStrategy: "entries",
  removeAdditionalStrategy: "passthrough",
  allowedAdditionalProperties: true,
  rejectedAdditionalProperties: false,
  definitionPath: "definitions",
  target: "jsonSchema7",
  strictUnions: false,
  definitions: {},
  errorMessages: false,
  markdownDescription: false,
  patternStrategy: "escape",
  applyRegexFlags: false,
  emailStrategy: "format:email",
  base64Strategy: "contentEncoding:base64",
  nameStrategy: "ref",
  openAiAnyTypeName: "OpenAiAnyType"
};
var getDefaultOptions = (options) => typeof options === "string" ? {
  ...defaultOptions,
  name: options
} : {
  ...defaultOptions,
  ...options
};

// node_modules/zod-to-json-schema/dist/esm/Refs.js
var getRefs = (options) => {
  const _options = getDefaultOptions(options);
  const currentPath = _options.name !== void 0 ? [..._options.basePath, _options.definitionPath, _options.name] : _options.basePath;
  return {
    ..._options,
    flags: { hasReferencedOpenAiAnyType: false },
    currentPath,
    propertyPath: void 0,
    seen: new Map(Object.entries(_options.definitions).map(([name, def]) => [
      def._def,
      {
        def: def._def,
        path: [..._options.basePath, _options.definitionPath, name],
        // Resolution of references will be forced even though seen, so it's ok that the schema is undefined here for now.
        jsonSchema: void 0
      }
    ]))
  };
};

// node_modules/zod-to-json-schema/dist/esm/errorMessages.js
function addErrorMessage(res, key, errorMessage, refs) {
  if (!refs?.errorMessages)
    return;
  if (errorMessage) {
    res.errorMessage = {
      ...res.errorMessage,
      [key]: errorMessage
    };
  }
}
function setResponseValueAndErrors(res, key, value, errorMessage, refs) {
  res[key] = value;
  addErrorMessage(res, key, errorMessage, refs);
}

// node_modules/zod-to-json-schema/dist/esm/getRelativePath.js
var getRelativePath = (pathA, pathB) => {
  let i = 0;
  for (; i < pathA.length && i < pathB.length; i++) {
    if (pathA[i] !== pathB[i])
      break;
  }
  return [(pathA.length - i).toString(), ...pathB.slice(i)].join("/");
};

// node_modules/zod-to-json-schema/dist/esm/parsers/any.js
function parseAnyDef(refs) {
  if (refs.target !== "openAi") {
    return {};
  }
  const anyDefinitionPath = [
    ...refs.basePath,
    refs.definitionPath,
    refs.openAiAnyTypeName
  ];
  refs.flags.hasReferencedOpenAiAnyType = true;
  return {
    $ref: refs.$refStrategy === "relative" ? getRelativePath(anyDefinitionPath, refs.currentPath) : anyDefinitionPath.join("/")
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/array.js
function parseArrayDef(def, refs) {
  const res = {
    type: "array"
  };
  if (def.type?._def && def.type?._def?.typeName !== ZodFirstPartyTypeKind.ZodAny) {
    res.items = parseDef(def.type._def, {
      ...refs,
      currentPath: [...refs.currentPath, "items"]
    });
  }
  if (def.minLength) {
    setResponseValueAndErrors(res, "minItems", def.minLength.value, def.minLength.message, refs);
  }
  if (def.maxLength) {
    setResponseValueAndErrors(res, "maxItems", def.maxLength.value, def.maxLength.message, refs);
  }
  if (def.exactLength) {
    setResponseValueAndErrors(res, "minItems", def.exactLength.value, def.exactLength.message, refs);
    setResponseValueAndErrors(res, "maxItems", def.exactLength.value, def.exactLength.message, refs);
  }
  return res;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/bigint.js
function parseBigintDef(def, refs) {
  const res = {
    type: "integer",
    format: "int64"
  };
  if (!def.checks)
    return res;
  for (const check3 of def.checks) {
    switch (check3.kind) {
      case "min":
        if (refs.target === "jsonSchema7") {
          if (check3.inclusive) {
            setResponseValueAndErrors(res, "minimum", check3.value, check3.message, refs);
          } else {
            setResponseValueAndErrors(res, "exclusiveMinimum", check3.value, check3.message, refs);
          }
        } else {
          if (!check3.inclusive) {
            res.exclusiveMinimum = true;
          }
          setResponseValueAndErrors(res, "minimum", check3.value, check3.message, refs);
        }
        break;
      case "max":
        if (refs.target === "jsonSchema7") {
          if (check3.inclusive) {
            setResponseValueAndErrors(res, "maximum", check3.value, check3.message, refs);
          } else {
            setResponseValueAndErrors(res, "exclusiveMaximum", check3.value, check3.message, refs);
          }
        } else {
          if (!check3.inclusive) {
            res.exclusiveMaximum = true;
          }
          setResponseValueAndErrors(res, "maximum", check3.value, check3.message, refs);
        }
        break;
      case "multipleOf":
        setResponseValueAndErrors(res, "multipleOf", check3.value, check3.message, refs);
        break;
    }
  }
  return res;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/boolean.js
function parseBooleanDef() {
  return {
    type: "boolean"
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/branded.js
function parseBrandedDef(_def, refs) {
  return parseDef(_def.type._def, refs);
}

// node_modules/zod-to-json-schema/dist/esm/parsers/catch.js
var parseCatchDef = (def, refs) => {
  return parseDef(def.innerType._def, refs);
};

// node_modules/zod-to-json-schema/dist/esm/parsers/date.js
function parseDateDef(def, refs, overrideDateStrategy) {
  const strategy = overrideDateStrategy ?? refs.dateStrategy;
  if (Array.isArray(strategy)) {
    return {
      anyOf: strategy.map((item, i) => parseDateDef(def, refs, item))
    };
  }
  switch (strategy) {
    case "string":
    case "format:date-time":
      return {
        type: "string",
        format: "date-time"
      };
    case "format:date":
      return {
        type: "string",
        format: "date"
      };
    case "integer":
      return integerDateParser(def, refs);
  }
}
var integerDateParser = (def, refs) => {
  const res = {
    type: "integer",
    format: "unix-time"
  };
  if (refs.target === "openApi3") {
    return res;
  }
  for (const check3 of def.checks) {
    switch (check3.kind) {
      case "min":
        setResponseValueAndErrors(
          res,
          "minimum",
          check3.value,
          // This is in milliseconds
          check3.message,
          refs
        );
        break;
      case "max":
        setResponseValueAndErrors(
          res,
          "maximum",
          check3.value,
          // This is in milliseconds
          check3.message,
          refs
        );
        break;
    }
  }
  return res;
};

// node_modules/zod-to-json-schema/dist/esm/parsers/default.js
function parseDefaultDef(_def, refs) {
  return {
    ...parseDef(_def.innerType._def, refs),
    default: _def.defaultValue()
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/effects.js
function parseEffectsDef(_def, refs) {
  return refs.effectStrategy === "input" ? parseDef(_def.schema._def, refs) : parseAnyDef(refs);
}

// node_modules/zod-to-json-schema/dist/esm/parsers/enum.js
function parseEnumDef(def) {
  return {
    type: "string",
    enum: Array.from(def.values)
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/intersection.js
var isJsonSchema7AllOfType = (type) => {
  if ("type" in type && type.type === "string")
    return false;
  return "allOf" in type;
};
function parseIntersectionDef(def, refs) {
  const allOf = [
    parseDef(def.left._def, {
      ...refs,
      currentPath: [...refs.currentPath, "allOf", "0"]
    }),
    parseDef(def.right._def, {
      ...refs,
      currentPath: [...refs.currentPath, "allOf", "1"]
    })
  ].filter((x) => !!x);
  let unevaluatedProperties = refs.target === "jsonSchema2019-09" ? { unevaluatedProperties: false } : void 0;
  const mergedAllOf = [];
  allOf.forEach((schema) => {
    if (isJsonSchema7AllOfType(schema)) {
      mergedAllOf.push(...schema.allOf);
      if (schema.unevaluatedProperties === void 0) {
        unevaluatedProperties = void 0;
      }
    } else {
      let nestedSchema = schema;
      if ("additionalProperties" in schema && schema.additionalProperties === false) {
        const { additionalProperties, ...rest } = schema;
        nestedSchema = rest;
      } else {
        unevaluatedProperties = void 0;
      }
      mergedAllOf.push(nestedSchema);
    }
  });
  return mergedAllOf.length ? {
    allOf: mergedAllOf,
    ...unevaluatedProperties
  } : void 0;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/literal.js
function parseLiteralDef(def, refs) {
  const parsedType = typeof def.value;
  if (parsedType !== "bigint" && parsedType !== "number" && parsedType !== "boolean" && parsedType !== "string") {
    return {
      type: Array.isArray(def.value) ? "array" : "object"
    };
  }
  if (refs.target === "openApi3") {
    return {
      type: parsedType === "bigint" ? "integer" : parsedType,
      enum: [def.value]
    };
  }
  return {
    type: parsedType === "bigint" ? "integer" : parsedType,
    const: def.value
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/string.js
var emojiRegex2 = void 0;
var zodPatterns = {
  /**
   * `c` was changed to `[cC]` to replicate /i flag
   */
  cuid: /^[cC][^\s-]{8,}$/,
  cuid2: /^[0-9a-z]+$/,
  ulid: /^[0-9A-HJKMNP-TV-Z]{26}$/,
  /**
   * `a-z` was added to replicate /i flag
   */
  email: /^(?!\.)(?!.*\.\.)([a-zA-Z0-9_'+\-\.]*)[a-zA-Z0-9_+-]@([a-zA-Z0-9][a-zA-Z0-9\-]*\.)+[a-zA-Z]{2,}$/,
  /**
   * Constructed a valid Unicode RegExp
   *
   * Lazily instantiate since this type of regex isn't supported
   * in all envs (e.g. React Native).
   *
   * See:
   * https://github.com/colinhacks/zod/issues/2433
   * Fix in Zod:
   * https://github.com/colinhacks/zod/commit/9340fd51e48576a75adc919bff65dbc4a5d4c99b
   */
  emoji: () => {
    if (emojiRegex2 === void 0) {
      emojiRegex2 = RegExp("^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$", "u");
    }
    return emojiRegex2;
  },
  /**
   * Unused
   */
  uuid: /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/,
  /**
   * Unused
   */
  ipv4: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,
  ipv4Cidr: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/,
  /**
   * Unused
   */
  ipv6: /^(([a-f0-9]{1,4}:){7}|::([a-f0-9]{1,4}:){0,6}|([a-f0-9]{1,4}:){1}:([a-f0-9]{1,4}:){0,5}|([a-f0-9]{1,4}:){2}:([a-f0-9]{1,4}:){0,4}|([a-f0-9]{1,4}:){3}:([a-f0-9]{1,4}:){0,3}|([a-f0-9]{1,4}:){4}:([a-f0-9]{1,4}:){0,2}|([a-f0-9]{1,4}:){5}:([a-f0-9]{1,4}:){0,1})([a-f0-9]{1,4}|(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2})))$/,
  ipv6Cidr: /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,
  base64: /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/,
  base64url: /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/,
  nanoid: /^[a-zA-Z0-9_-]{21}$/,
  jwt: /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/
};
function parseStringDef(def, refs) {
  const res = {
    type: "string"
  };
  if (def.checks) {
    for (const check3 of def.checks) {
      switch (check3.kind) {
        case "min":
          setResponseValueAndErrors(res, "minLength", typeof res.minLength === "number" ? Math.max(res.minLength, check3.value) : check3.value, check3.message, refs);
          break;
        case "max":
          setResponseValueAndErrors(res, "maxLength", typeof res.maxLength === "number" ? Math.min(res.maxLength, check3.value) : check3.value, check3.message, refs);
          break;
        case "email":
          switch (refs.emailStrategy) {
            case "format:email":
              addFormat(res, "email", check3.message, refs);
              break;
            case "format:idn-email":
              addFormat(res, "idn-email", check3.message, refs);
              break;
            case "pattern:zod":
              addPattern(res, zodPatterns.email, check3.message, refs);
              break;
          }
          break;
        case "url":
          addFormat(res, "uri", check3.message, refs);
          break;
        case "uuid":
          addFormat(res, "uuid", check3.message, refs);
          break;
        case "regex":
          addPattern(res, check3.regex, check3.message, refs);
          break;
        case "cuid":
          addPattern(res, zodPatterns.cuid, check3.message, refs);
          break;
        case "cuid2":
          addPattern(res, zodPatterns.cuid2, check3.message, refs);
          break;
        case "startsWith":
          addPattern(res, RegExp(`^${escapeLiteralCheckValue(check3.value, refs)}`), check3.message, refs);
          break;
        case "endsWith":
          addPattern(res, RegExp(`${escapeLiteralCheckValue(check3.value, refs)}$`), check3.message, refs);
          break;
        case "datetime":
          addFormat(res, "date-time", check3.message, refs);
          break;
        case "date":
          addFormat(res, "date", check3.message, refs);
          break;
        case "time":
          addFormat(res, "time", check3.message, refs);
          break;
        case "duration":
          addFormat(res, "duration", check3.message, refs);
          break;
        case "length":
          setResponseValueAndErrors(res, "minLength", typeof res.minLength === "number" ? Math.max(res.minLength, check3.value) : check3.value, check3.message, refs);
          setResponseValueAndErrors(res, "maxLength", typeof res.maxLength === "number" ? Math.min(res.maxLength, check3.value) : check3.value, check3.message, refs);
          break;
        case "includes": {
          addPattern(res, RegExp(escapeLiteralCheckValue(check3.value, refs)), check3.message, refs);
          break;
        }
        case "ip": {
          if (check3.version !== "v6") {
            addFormat(res, "ipv4", check3.message, refs);
          }
          if (check3.version !== "v4") {
            addFormat(res, "ipv6", check3.message, refs);
          }
          break;
        }
        case "base64url":
          addPattern(res, zodPatterns.base64url, check3.message, refs);
          break;
        case "jwt":
          addPattern(res, zodPatterns.jwt, check3.message, refs);
          break;
        case "cidr": {
          if (check3.version !== "v6") {
            addPattern(res, zodPatterns.ipv4Cidr, check3.message, refs);
          }
          if (check3.version !== "v4") {
            addPattern(res, zodPatterns.ipv6Cidr, check3.message, refs);
          }
          break;
        }
        case "emoji":
          addPattern(res, zodPatterns.emoji(), check3.message, refs);
          break;
        case "ulid": {
          addPattern(res, zodPatterns.ulid, check3.message, refs);
          break;
        }
        case "base64": {
          switch (refs.base64Strategy) {
            case "format:binary": {
              addFormat(res, "binary", check3.message, refs);
              break;
            }
            case "contentEncoding:base64": {
              setResponseValueAndErrors(res, "contentEncoding", "base64", check3.message, refs);
              break;
            }
            case "pattern:zod": {
              addPattern(res, zodPatterns.base64, check3.message, refs);
              break;
            }
          }
          break;
        }
        case "nanoid": {
          addPattern(res, zodPatterns.nanoid, check3.message, refs);
        }
        case "toLowerCase":
        case "toUpperCase":
        case "trim":
          break;
        default:
          /* @__PURE__ */ ((_) => {
          })(check3);
      }
    }
  }
  return res;
}
function escapeLiteralCheckValue(literal, refs) {
  return refs.patternStrategy === "escape" ? escapeNonAlphaNumeric(literal) : literal;
}
var ALPHA_NUMERIC = new Set("ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvxyz0123456789");
function escapeNonAlphaNumeric(source) {
  let result2 = "";
  for (let i = 0; i < source.length; i++) {
    if (!ALPHA_NUMERIC.has(source[i])) {
      result2 += "\\";
    }
    result2 += source[i];
  }
  return result2;
}
function addFormat(schema, value, message, refs) {
  if (schema.format || schema.anyOf?.some((x) => x.format)) {
    if (!schema.anyOf) {
      schema.anyOf = [];
    }
    if (schema.format) {
      schema.anyOf.push({
        format: schema.format,
        ...schema.errorMessage && refs.errorMessages && {
          errorMessage: { format: schema.errorMessage.format }
        }
      });
      delete schema.format;
      if (schema.errorMessage) {
        delete schema.errorMessage.format;
        if (Object.keys(schema.errorMessage).length === 0) {
          delete schema.errorMessage;
        }
      }
    }
    schema.anyOf.push({
      format: value,
      ...message && refs.errorMessages && { errorMessage: { format: message } }
    });
  } else {
    setResponseValueAndErrors(schema, "format", value, message, refs);
  }
}
function addPattern(schema, regex, message, refs) {
  if (schema.pattern || schema.allOf?.some((x) => x.pattern)) {
    if (!schema.allOf) {
      schema.allOf = [];
    }
    if (schema.pattern) {
      schema.allOf.push({
        pattern: schema.pattern,
        ...schema.errorMessage && refs.errorMessages && {
          errorMessage: { pattern: schema.errorMessage.pattern }
        }
      });
      delete schema.pattern;
      if (schema.errorMessage) {
        delete schema.errorMessage.pattern;
        if (Object.keys(schema.errorMessage).length === 0) {
          delete schema.errorMessage;
        }
      }
    }
    schema.allOf.push({
      pattern: stringifyRegExpWithFlags(regex, refs),
      ...message && refs.errorMessages && { errorMessage: { pattern: message } }
    });
  } else {
    setResponseValueAndErrors(schema, "pattern", stringifyRegExpWithFlags(regex, refs), message, refs);
  }
}
function stringifyRegExpWithFlags(regex, refs) {
  if (!refs.applyRegexFlags || !regex.flags) {
    return regex.source;
  }
  const flags = {
    i: regex.flags.includes("i"),
    m: regex.flags.includes("m"),
    s: regex.flags.includes("s")
    // `.` matches newlines
  };
  const source = flags.i ? regex.source.toLowerCase() : regex.source;
  let pattern = "";
  let isEscaped = false;
  let inCharGroup = false;
  let inCharRange = false;
  for (let i = 0; i < source.length; i++) {
    if (isEscaped) {
      pattern += source[i];
      isEscaped = false;
      continue;
    }
    if (flags.i) {
      if (inCharGroup) {
        if (source[i].match(/[a-z]/)) {
          if (inCharRange) {
            pattern += source[i];
            pattern += `${source[i - 2]}-${source[i]}`.toUpperCase();
            inCharRange = false;
          } else if (source[i + 1] === "-" && source[i + 2]?.match(/[a-z]/)) {
            pattern += source[i];
            inCharRange = true;
          } else {
            pattern += `${source[i]}${source[i].toUpperCase()}`;
          }
          continue;
        }
      } else if (source[i].match(/[a-z]/)) {
        pattern += `[${source[i]}${source[i].toUpperCase()}]`;
        continue;
      }
    }
    if (flags.m) {
      if (source[i] === "^") {
        pattern += `(^|(?<=[\r
]))`;
        continue;
      } else if (source[i] === "$") {
        pattern += `($|(?=[\r
]))`;
        continue;
      }
    }
    if (flags.s && source[i] === ".") {
      pattern += inCharGroup ? `${source[i]}\r
` : `[${source[i]}\r
]`;
      continue;
    }
    pattern += source[i];
    if (source[i] === "\\") {
      isEscaped = true;
    } else if (inCharGroup && source[i] === "]") {
      inCharGroup = false;
    } else if (!inCharGroup && source[i] === "[") {
      inCharGroup = true;
    }
  }
  try {
    new RegExp(pattern);
  } catch {
    console.warn(`Could not convert regex pattern at ${refs.currentPath.join("/")} to a flag-independent form! Falling back to the flag-ignorant source`);
    return regex.source;
  }
  return pattern;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/record.js
function parseRecordDef(def, refs) {
  if (refs.target === "openAi") {
    console.warn("Warning: OpenAI may not support records in schemas! Try an array of key-value pairs instead.");
  }
  if (refs.target === "openApi3" && def.keyType?._def.typeName === ZodFirstPartyTypeKind.ZodEnum) {
    return {
      type: "object",
      required: def.keyType._def.values,
      properties: def.keyType._def.values.reduce((acc, key) => ({
        ...acc,
        [key]: parseDef(def.valueType._def, {
          ...refs,
          currentPath: [...refs.currentPath, "properties", key]
        }) ?? parseAnyDef(refs)
      }), {}),
      additionalProperties: refs.rejectedAdditionalProperties
    };
  }
  const schema = {
    type: "object",
    additionalProperties: parseDef(def.valueType._def, {
      ...refs,
      currentPath: [...refs.currentPath, "additionalProperties"]
    }) ?? refs.allowedAdditionalProperties
  };
  if (refs.target === "openApi3") {
    return schema;
  }
  if (def.keyType?._def.typeName === ZodFirstPartyTypeKind.ZodString && def.keyType._def.checks?.length) {
    const { type, ...keyType } = parseStringDef(def.keyType._def, refs);
    return {
      ...schema,
      propertyNames: keyType
    };
  } else if (def.keyType?._def.typeName === ZodFirstPartyTypeKind.ZodEnum) {
    return {
      ...schema,
      propertyNames: {
        enum: def.keyType._def.values
      }
    };
  } else if (def.keyType?._def.typeName === ZodFirstPartyTypeKind.ZodBranded && def.keyType._def.type._def.typeName === ZodFirstPartyTypeKind.ZodString && def.keyType._def.type._def.checks?.length) {
    const { type, ...keyType } = parseBrandedDef(def.keyType._def, refs);
    return {
      ...schema,
      propertyNames: keyType
    };
  }
  return schema;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/map.js
function parseMapDef(def, refs) {
  if (refs.mapStrategy === "record") {
    return parseRecordDef(def, refs);
  }
  const keys = parseDef(def.keyType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items", "items", "0"]
  }) || parseAnyDef(refs);
  const values = parseDef(def.valueType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items", "items", "1"]
  }) || parseAnyDef(refs);
  return {
    type: "array",
    maxItems: 125,
    items: {
      type: "array",
      items: [keys, values],
      minItems: 2,
      maxItems: 2
    }
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/nativeEnum.js
function parseNativeEnumDef(def) {
  const object = def.values;
  const actualKeys = Object.keys(def.values).filter((key) => {
    return typeof object[object[key]] !== "number";
  });
  const actualValues = actualKeys.map((key) => object[key]);
  const parsedTypes = Array.from(new Set(actualValues.map((values) => typeof values)));
  return {
    type: parsedTypes.length === 1 ? parsedTypes[0] === "string" ? "string" : "number" : ["string", "number"],
    enum: actualValues
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/never.js
function parseNeverDef(refs) {
  return refs.target === "openAi" ? void 0 : {
    not: parseAnyDef({
      ...refs,
      currentPath: [...refs.currentPath, "not"]
    })
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/null.js
function parseNullDef(refs) {
  return refs.target === "openApi3" ? {
    enum: ["null"],
    nullable: true
  } : {
    type: "null"
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/union.js
var primitiveMappings = {
  ZodString: "string",
  ZodNumber: "number",
  ZodBigInt: "integer",
  ZodBoolean: "boolean",
  ZodNull: "null"
};
function parseUnionDef(def, refs) {
  if (refs.target === "openApi3")
    return asAnyOf(def, refs);
  const options = def.options instanceof Map ? Array.from(def.options.values()) : def.options;
  if (options.every((x) => x._def.typeName in primitiveMappings && (!x._def.checks || !x._def.checks.length))) {
    const types = options.reduce((types2, x) => {
      const type = primitiveMappings[x._def.typeName];
      return type && !types2.includes(type) ? [...types2, type] : types2;
    }, []);
    return {
      type: types.length > 1 ? types : types[0]
    };
  } else if (options.every((x) => x._def.typeName === "ZodLiteral" && !x.description)) {
    const types = options.reduce((acc, x) => {
      const type = typeof x._def.value;
      switch (type) {
        case "string":
        case "number":
        case "boolean":
          return [...acc, type];
        case "bigint":
          return [...acc, "integer"];
        case "object":
          if (x._def.value === null)
            return [...acc, "null"];
        case "symbol":
        case "undefined":
        case "function":
        default:
          return acc;
      }
    }, []);
    if (types.length === options.length) {
      const uniqueTypes = types.filter((x, i, a) => a.indexOf(x) === i);
      return {
        type: uniqueTypes.length > 1 ? uniqueTypes : uniqueTypes[0],
        enum: options.reduce((acc, x) => {
          return acc.includes(x._def.value) ? acc : [...acc, x._def.value];
        }, [])
      };
    }
  } else if (options.every((x) => x._def.typeName === "ZodEnum")) {
    return {
      type: "string",
      enum: options.reduce((acc, x) => [
        ...acc,
        ...x._def.values.filter((x2) => !acc.includes(x2))
      ], [])
    };
  }
  return asAnyOf(def, refs);
}
var asAnyOf = (def, refs) => {
  const anyOf = (def.options instanceof Map ? Array.from(def.options.values()) : def.options).map((x, i) => parseDef(x._def, {
    ...refs,
    currentPath: [...refs.currentPath, "anyOf", `${i}`]
  })).filter((x) => !!x && (!refs.strictUnions || typeof x === "object" && Object.keys(x).length > 0));
  return anyOf.length ? { anyOf } : void 0;
};

// node_modules/zod-to-json-schema/dist/esm/parsers/nullable.js
function parseNullableDef(def, refs) {
  if (["ZodString", "ZodNumber", "ZodBigInt", "ZodBoolean", "ZodNull"].includes(def.innerType._def.typeName) && (!def.innerType._def.checks || !def.innerType._def.checks.length)) {
    if (refs.target === "openApi3") {
      return {
        type: primitiveMappings[def.innerType._def.typeName],
        nullable: true
      };
    }
    return {
      type: [
        primitiveMappings[def.innerType._def.typeName],
        "null"
      ]
    };
  }
  if (refs.target === "openApi3") {
    const base2 = parseDef(def.innerType._def, {
      ...refs,
      currentPath: [...refs.currentPath]
    });
    if (base2 && "$ref" in base2)
      return { allOf: [base2], nullable: true };
    return base2 && { ...base2, nullable: true };
  }
  const base = parseDef(def.innerType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "anyOf", "0"]
  });
  return base && { anyOf: [base, { type: "null" }] };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/number.js
function parseNumberDef(def, refs) {
  const res = {
    type: "number"
  };
  if (!def.checks)
    return res;
  for (const check3 of def.checks) {
    switch (check3.kind) {
      case "int":
        res.type = "integer";
        addErrorMessage(res, "type", check3.message, refs);
        break;
      case "min":
        if (refs.target === "jsonSchema7") {
          if (check3.inclusive) {
            setResponseValueAndErrors(res, "minimum", check3.value, check3.message, refs);
          } else {
            setResponseValueAndErrors(res, "exclusiveMinimum", check3.value, check3.message, refs);
          }
        } else {
          if (!check3.inclusive) {
            res.exclusiveMinimum = true;
          }
          setResponseValueAndErrors(res, "minimum", check3.value, check3.message, refs);
        }
        break;
      case "max":
        if (refs.target === "jsonSchema7") {
          if (check3.inclusive) {
            setResponseValueAndErrors(res, "maximum", check3.value, check3.message, refs);
          } else {
            setResponseValueAndErrors(res, "exclusiveMaximum", check3.value, check3.message, refs);
          }
        } else {
          if (!check3.inclusive) {
            res.exclusiveMaximum = true;
          }
          setResponseValueAndErrors(res, "maximum", check3.value, check3.message, refs);
        }
        break;
      case "multipleOf":
        setResponseValueAndErrors(res, "multipleOf", check3.value, check3.message, refs);
        break;
    }
  }
  return res;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/object.js
function parseObjectDef(def, refs) {
  const forceOptionalIntoNullable = refs.target === "openAi";
  const result2 = {
    type: "object",
    properties: {}
  };
  const required = [];
  const shape = def.shape();
  for (const propName in shape) {
    let propDef = shape[propName];
    if (propDef === void 0 || propDef._def === void 0) {
      continue;
    }
    let propOptional = safeIsOptional(propDef);
    if (propOptional && forceOptionalIntoNullable) {
      if (propDef._def.typeName === "ZodOptional") {
        propDef = propDef._def.innerType;
      }
      if (!propDef.isNullable()) {
        propDef = propDef.nullable();
      }
      propOptional = false;
    }
    const parsedDef = parseDef(propDef._def, {
      ...refs,
      currentPath: [...refs.currentPath, "properties", propName],
      propertyPath: [...refs.currentPath, "properties", propName]
    });
    if (parsedDef === void 0) {
      continue;
    }
    result2.properties[propName] = parsedDef;
    if (!propOptional) {
      required.push(propName);
    }
  }
  if (required.length) {
    result2.required = required;
  }
  const additionalProperties = decideAdditionalProperties(def, refs);
  if (additionalProperties !== void 0) {
    result2.additionalProperties = additionalProperties;
  }
  return result2;
}
function decideAdditionalProperties(def, refs) {
  if (def.catchall._def.typeName !== "ZodNever") {
    return parseDef(def.catchall._def, {
      ...refs,
      currentPath: [...refs.currentPath, "additionalProperties"]
    });
  }
  switch (def.unknownKeys) {
    case "passthrough":
      return refs.allowedAdditionalProperties;
    case "strict":
      return refs.rejectedAdditionalProperties;
    case "strip":
      return refs.removeAdditionalStrategy === "strict" ? refs.allowedAdditionalProperties : refs.rejectedAdditionalProperties;
  }
}
function safeIsOptional(schema) {
  try {
    return schema.isOptional();
  } catch {
    return true;
  }
}

// node_modules/zod-to-json-schema/dist/esm/parsers/optional.js
var parseOptionalDef = (def, refs) => {
  if (refs.currentPath.toString() === refs.propertyPath?.toString()) {
    return parseDef(def.innerType._def, refs);
  }
  const innerSchema = parseDef(def.innerType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "anyOf", "1"]
  });
  return innerSchema ? {
    anyOf: [
      {
        not: parseAnyDef(refs)
      },
      innerSchema
    ]
  } : parseAnyDef(refs);
};

// node_modules/zod-to-json-schema/dist/esm/parsers/pipeline.js
var parsePipelineDef = (def, refs) => {
  if (refs.pipeStrategy === "input") {
    return parseDef(def.in._def, refs);
  } else if (refs.pipeStrategy === "output") {
    return parseDef(def.out._def, refs);
  }
  const a = parseDef(def.in._def, {
    ...refs,
    currentPath: [...refs.currentPath, "allOf", "0"]
  });
  const b = parseDef(def.out._def, {
    ...refs,
    currentPath: [...refs.currentPath, "allOf", a ? "1" : "0"]
  });
  return {
    allOf: [a, b].filter((x) => x !== void 0)
  };
};

// node_modules/zod-to-json-schema/dist/esm/parsers/promise.js
function parsePromiseDef(def, refs) {
  return parseDef(def.type._def, refs);
}

// node_modules/zod-to-json-schema/dist/esm/parsers/set.js
function parseSetDef(def, refs) {
  const items = parseDef(def.valueType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items"]
  });
  const schema = {
    type: "array",
    uniqueItems: true,
    items
  };
  if (def.minSize) {
    setResponseValueAndErrors(schema, "minItems", def.minSize.value, def.minSize.message, refs);
  }
  if (def.maxSize) {
    setResponseValueAndErrors(schema, "maxItems", def.maxSize.value, def.maxSize.message, refs);
  }
  return schema;
}

// node_modules/zod-to-json-schema/dist/esm/parsers/tuple.js
function parseTupleDef(def, refs) {
  if (def.rest) {
    return {
      type: "array",
      minItems: def.items.length,
      items: def.items.map((x, i) => parseDef(x._def, {
        ...refs,
        currentPath: [...refs.currentPath, "items", `${i}`]
      })).reduce((acc, x) => x === void 0 ? acc : [...acc, x], []),
      additionalItems: parseDef(def.rest._def, {
        ...refs,
        currentPath: [...refs.currentPath, "additionalItems"]
      })
    };
  } else {
    return {
      type: "array",
      minItems: def.items.length,
      maxItems: def.items.length,
      items: def.items.map((x, i) => parseDef(x._def, {
        ...refs,
        currentPath: [...refs.currentPath, "items", `${i}`]
      })).reduce((acc, x) => x === void 0 ? acc : [...acc, x], [])
    };
  }
}

// node_modules/zod-to-json-schema/dist/esm/parsers/undefined.js
function parseUndefinedDef(refs) {
  return {
    not: parseAnyDef(refs)
  };
}

// node_modules/zod-to-json-schema/dist/esm/parsers/unknown.js
function parseUnknownDef(refs) {
  return parseAnyDef(refs);
}

// node_modules/zod-to-json-schema/dist/esm/parsers/readonly.js
var parseReadonlyDef = (def, refs) => {
  return parseDef(def.innerType._def, refs);
};

// node_modules/zod-to-json-schema/dist/esm/selectParser.js
var selectParser = (def, typeName, refs) => {
  switch (typeName) {
    case ZodFirstPartyTypeKind.ZodString:
      return parseStringDef(def, refs);
    case ZodFirstPartyTypeKind.ZodNumber:
      return parseNumberDef(def, refs);
    case ZodFirstPartyTypeKind.ZodObject:
      return parseObjectDef(def, refs);
    case ZodFirstPartyTypeKind.ZodBigInt:
      return parseBigintDef(def, refs);
    case ZodFirstPartyTypeKind.ZodBoolean:
      return parseBooleanDef();
    case ZodFirstPartyTypeKind.ZodDate:
      return parseDateDef(def, refs);
    case ZodFirstPartyTypeKind.ZodUndefined:
      return parseUndefinedDef(refs);
    case ZodFirstPartyTypeKind.ZodNull:
      return parseNullDef(refs);
    case ZodFirstPartyTypeKind.ZodArray:
      return parseArrayDef(def, refs);
    case ZodFirstPartyTypeKind.ZodUnion:
    case ZodFirstPartyTypeKind.ZodDiscriminatedUnion:
      return parseUnionDef(def, refs);
    case ZodFirstPartyTypeKind.ZodIntersection:
      return parseIntersectionDef(def, refs);
    case ZodFirstPartyTypeKind.ZodTuple:
      return parseTupleDef(def, refs);
    case ZodFirstPartyTypeKind.ZodRecord:
      return parseRecordDef(def, refs);
    case ZodFirstPartyTypeKind.ZodLiteral:
      return parseLiteralDef(def, refs);
    case ZodFirstPartyTypeKind.ZodEnum:
      return parseEnumDef(def);
    case ZodFirstPartyTypeKind.ZodNativeEnum:
      return parseNativeEnumDef(def);
    case ZodFirstPartyTypeKind.ZodNullable:
      return parseNullableDef(def, refs);
    case ZodFirstPartyTypeKind.ZodOptional:
      return parseOptionalDef(def, refs);
    case ZodFirstPartyTypeKind.ZodMap:
      return parseMapDef(def, refs);
    case ZodFirstPartyTypeKind.ZodSet:
      return parseSetDef(def, refs);
    case ZodFirstPartyTypeKind.ZodLazy:
      return () => def.getter()._def;
    case ZodFirstPartyTypeKind.ZodPromise:
      return parsePromiseDef(def, refs);
    case ZodFirstPartyTypeKind.ZodNaN:
    case ZodFirstPartyTypeKind.ZodNever:
      return parseNeverDef(refs);
    case ZodFirstPartyTypeKind.ZodEffects:
      return parseEffectsDef(def, refs);
    case ZodFirstPartyTypeKind.ZodAny:
      return parseAnyDef(refs);
    case ZodFirstPartyTypeKind.ZodUnknown:
      return parseUnknownDef(refs);
    case ZodFirstPartyTypeKind.ZodDefault:
      return parseDefaultDef(def, refs);
    case ZodFirstPartyTypeKind.ZodBranded:
      return parseBrandedDef(def, refs);
    case ZodFirstPartyTypeKind.ZodReadonly:
      return parseReadonlyDef(def, refs);
    case ZodFirstPartyTypeKind.ZodCatch:
      return parseCatchDef(def, refs);
    case ZodFirstPartyTypeKind.ZodPipeline:
      return parsePipelineDef(def, refs);
    case ZodFirstPartyTypeKind.ZodFunction:
    case ZodFirstPartyTypeKind.ZodVoid:
    case ZodFirstPartyTypeKind.ZodSymbol:
      return void 0;
    default:
      return /* @__PURE__ */ ((_) => void 0)(typeName);
  }
};

// node_modules/zod-to-json-schema/dist/esm/parseDef.js
function parseDef(def, refs, forceResolution = false) {
  const seenItem = refs.seen.get(def);
  if (refs.override) {
    const overrideResult = refs.override?.(def, refs, seenItem, forceResolution);
    if (overrideResult !== ignoreOverride) {
      return overrideResult;
    }
  }
  if (seenItem && !forceResolution) {
    const seenSchema = get$ref(seenItem, refs);
    if (seenSchema !== void 0) {
      return seenSchema;
    }
  }
  const newItem = { def, path: refs.currentPath, jsonSchema: void 0 };
  refs.seen.set(def, newItem);
  const jsonSchemaOrGetter = selectParser(def, def.typeName, refs);
  const jsonSchema = typeof jsonSchemaOrGetter === "function" ? parseDef(jsonSchemaOrGetter(), refs) : jsonSchemaOrGetter;
  if (jsonSchema) {
    addMeta(def, refs, jsonSchema);
  }
  if (refs.postProcess) {
    const postProcessResult = refs.postProcess(jsonSchema, def, refs);
    newItem.jsonSchema = jsonSchema;
    return postProcessResult;
  }
  newItem.jsonSchema = jsonSchema;
  return jsonSchema;
}
var get$ref = (item, refs) => {
  switch (refs.$refStrategy) {
    case "root":
      return { $ref: item.path.join("/") };
    case "relative":
      return { $ref: getRelativePath(refs.currentPath, item.path) };
    case "none":
    case "seen": {
      if (item.path.length < refs.currentPath.length && item.path.every((value, index) => refs.currentPath[index] === value)) {
        console.warn(`Recursive reference detected at ${refs.currentPath.join("/")}! Defaulting to any`);
        return parseAnyDef(refs);
      }
      return refs.$refStrategy === "seen" ? parseAnyDef(refs) : void 0;
    }
  }
};
var addMeta = (def, refs, jsonSchema) => {
  if (def.description) {
    jsonSchema.description = def.description;
    if (refs.markdownDescription) {
      jsonSchema.markdownDescription = def.description;
    }
  }
  return jsonSchema;
};

// node_modules/zod-to-json-schema/dist/esm/zodToJsonSchema.js
var zodToJsonSchema = (schema, options) => {
  const refs = getRefs(options);
  let definitions = typeof options === "object" && options.definitions ? Object.entries(options.definitions).reduce((acc, [name2, schema2]) => ({
    ...acc,
    [name2]: parseDef(schema2._def, {
      ...refs,
      currentPath: [...refs.basePath, refs.definitionPath, name2]
    }, true) ?? parseAnyDef(refs)
  }), {}) : void 0;
  const name = typeof options === "string" ? options : options?.nameStrategy === "title" ? void 0 : options?.name;
  const main2 = parseDef(schema._def, name === void 0 ? refs : {
    ...refs,
    currentPath: [...refs.basePath, refs.definitionPath, name]
  }, false) ?? parseAnyDef(refs);
  const title = typeof options === "object" && options.name !== void 0 && options.nameStrategy === "title" ? options.name : void 0;
  if (title !== void 0) {
    main2.title = title;
  }
  if (refs.flags.hasReferencedOpenAiAnyType) {
    if (!definitions) {
      definitions = {};
    }
    if (!definitions[refs.openAiAnyTypeName]) {
      definitions[refs.openAiAnyTypeName] = {
        // Skipping "object" as no properties can be defined and additionalProperties must be "false"
        type: ["string", "number", "integer", "boolean", "array", "null"],
        items: {
          $ref: refs.$refStrategy === "relative" ? "1" : [
            ...refs.basePath,
            refs.definitionPath,
            refs.openAiAnyTypeName
          ].join("/")
        }
      };
    }
  }
  const combined = name === void 0 ? definitions ? {
    ...main2,
    [refs.definitionPath]: definitions
  } : main2 : {
    $ref: [
      ...refs.$refStrategy === "relative" ? [] : refs.basePath,
      refs.definitionPath,
      name
    ].join("/"),
    [refs.definitionPath]: {
      ...definitions,
      [name]: main2
    }
  };
  if (refs.target === "jsonSchema7") {
    combined.$schema = "http://json-schema.org/draft-07/schema#";
  } else if (refs.target === "jsonSchema2019-09" || refs.target === "openAi") {
    combined.$schema = "https://json-schema.org/draft/2019-09/schema#";
  }
  if (refs.target === "openAi" && ("anyOf" in combined || "oneOf" in combined || "allOf" in combined || "type" in combined && Array.isArray(combined.type))) {
    console.warn("Warning: OpenAI may not support schemas with unions as roots! Try wrapping it in an object property.");
  }
  return combined;
};

// floe-bridge/dist/runtime-core/substrate-tool-definitions.js
var FLOE_DIRECT_TOOL_CALLBACK_PROVENANCE = "floe_direct_tool_callback";
var FLOE_RUNTIME_TOOL_IDENTITY = {
  runtimeName: "floe-runtime",
  emitOrigin: "floe_emit_tool",
  requestOrigin: "floe_request_tool"
};
var EMIT_INPUT_SCHEMA = external_exports.object({
  type: external_exports.string(),
  destination: external_exports.string().describe("A neutral actor ref from list_endpoints, or 'current_context'."),
  text: external_exports.string(),
  references: external_exports.array(external_exports.object({
    name: external_exports.string().min(1).describe("Useful name shown on the Open button, such as Local preview approval."),
    resource_ref: external_exports.object({
      kind: external_exports.string().min(1),
      id: external_exports.string().min(1),
      revision: external_exports.union([external_exports.string().min(1), external_exports.null()])
    }).describe("Exact resource reference returned by an operation. Do not infer kind or revision from an ID.")
  })).optional(),
  attachments: external_exports.array(external_exports.object({
    artefact_version_id: external_exports.string().min(1).describe("Exact published ArtefactVersion to attach."),
    name: external_exports.string().min(1).describe("Clear result name shown on the attachment button.")
  })).optional(),
  artefact_version_ids: external_exports.array(external_exports.string()).optional().describe("Additional exact published ArtefactVersion IDs without display names."),
  data: external_exports.record(external_exports.string(), external_exports.unknown()).optional().describe("Optional structured Event data. Use only when a client or extension contract requires it.")
});
var REQUEST_INPUT_SCHEMA = external_exports.object({
  actor: external_exports.string().describe("A neutral actor ref from list_endpoints."),
  work: external_exports.string().describe("The bounded work or question for that actor."),
  artefact_version_ids: external_exports.array(external_exports.string().min(1)).optional().describe("Exact published input versions for the actor to inspect with read_artefact.")
});
var CAPABILITY_TARGET_SCHEMA = external_exports.object({
  kind: external_exports.string().min(1).describe("Canonical resource kind"),
  id: external_exports.string().min(1).describe("Canonical resource id")
});
var DISCOVER_CAPABILITIES_INPUT_SCHEMA = external_exports.object({
  query: external_exports.string().optional().describe("One or two specific keywords. Long sentences match unrelated operations."),
  operation_id: external_exports.string().optional().describe("Exact operation_id from a search result; returns this operation's authoritative input contract."),
  include_result_schema: external_exports.boolean().optional().describe("Include the selected operation's full result schema when building an integration. Ordinary invocation returns its result directly."),
  category: external_exports.string().optional().describe("Optional category returned by an earlier discovery."),
  target: CAPABILITY_TARGET_SCHEMA.optional().describe("Optional selected resource used to evaluate target-specific availability. Omit until the operation's target kind is known from discovery."),
  limit: external_exports.number().min(1).max(20).optional().describe("Maximum matching operations to return.")
});
var USE_CAPABILITY_INPUT_SCHEMA = external_exports.object({
  operation_id: external_exports.string().min(1).describe("Exact operation_id returned by discover_capabilities."),
  operation_version: external_exports.string().min(1).describe("Exact operation_version returned by discover_capabilities."),
  input_schema_version: external_exports.string().min(1).describe("Exact input.version returned by discover_capabilities."),
  target: CAPABILITY_TARGET_SCHEMA.optional().describe("Target required by the discovered operation, when applicable."),
  expected_resource_revision: external_exports.string().optional().describe("Exact target revision when the operation requires or accepts optimistic concurrency."),
  idempotency_key: external_exports.string().optional().describe("Stable caller key. Reuse it after a timeout when the operation outcome is unknown."),
  input: external_exports.record(external_exports.string(), external_exports.unknown()).describe("Input matching the exact discovered input.schema.")
});
var PULSE_SUBSCRIBER_SCHEMA = external_exports.union([
  external_exports.object({
    kind: external_exports.literal("context"),
    context_id: external_exports.string().min(1).describe("Context that should render the pulse.fired event without waking an actor.")
  }),
  external_exports.object({
    kind: external_exports.literal("endpoint").optional(),
    endpoint_ref: external_exports.string().min(1).describe("Neutral actor ref that should receive the pulse delivery as work."),
    context_id: external_exports.string().min(1).optional().describe("Context associated with this endpoint delivery for reply/continuation.")
  })
]);
var PULSE_CONTENT_SCHEMA = external_exports.object({
  text: external_exports.string().optional().describe("Text to render for context subscribers."),
  instructions: external_exports.string().optional().describe("Instructions for endpoint subscribers to process when delivered.")
});
var CREATE_PULSE_INPUT_SCHEMA = external_exports.object({
  pulse_id: external_exports.string().min(1).describe("Unique pulse identifier within the workspace."),
  trigger: external_exports.object({
    type: external_exports.enum(["once", "cron"]).describe("'once' for a one-off scheduled pulse, 'cron' for a recurring one."),
    at: external_exports.string().optional().describe("ISO 8601 timestamp for one-off pulses, or relative text like '30 seconds from now'."),
    after_seconds: external_exports.number().optional().describe("Relative one-off delay in seconds. Use 30 for '30 seconds from now'."),
    schedule: external_exports.string().optional().describe("Cron expression for recurring pulses."),
    timezone: external_exports.string().optional().describe("IANA timezone (default: UTC).")
  }).describe("When the pulse fires."),
  event: external_exports.object({
    type: external_exports.literal("pulse.fired"),
    content: PULSE_CONTENT_SCHEMA.optional()
  }).optional().describe("The pulse.fired event content delivered to subscribers."),
  content: PULSE_CONTENT_SCHEMA.optional().describe("Alias for event.content; prefer event.content."),
  subscribers: external_exports.array(PULSE_SUBSCRIBER_SCHEMA).describe("Who receives the pulse: context subscribers render it, endpoint subscribers act on it."),
  persistence: external_exports.enum(["workspace", "local"]).optional().describe("'workspace' persists into committed floe.yaml; 'local' is runtime-backed (default)."),
  scope_id: external_exports.string().optional().describe("Optional organising Scope id. Omit unless a Scope must own the pulse.")
});
var LIST_PULSES_INPUT_SCHEMA = external_exports.object({
  status: external_exports.string().optional().describe("Filter by status: active, paused, cancelled, or fired.")
});
var PULSE_ID_INPUT_SCHEMA = external_exports.object({
  pulse_id: external_exports.string().min(1).describe("The exact pulse identifier.")
});
var READ_ARTEFACT_INPUT_SCHEMA = external_exports.object({
  artefact_version_id: external_exports.string().min(1).describe("Exact immutable ArtefactVersion identity to read."),
  offset: external_exports.number().int().min(0).optional().describe("Text offset (UTF-16 units), starting at 0. Use the previous page's next_offset to continue."),
  limit: external_exports.number().int().min(1).max(16e3).optional().describe("Maximum text units to return (default 16,000). Smaller for a focused inspection.")
});
var SUBSTRATE_TOOL_DEFINITIONS = {
  emit: {
    name: "emit",
    title: "Emit Floe Event",
    description: "Deliberately publish an event that should cause or communicate something beyond your local turn result. Use attachments for named, openable saved results and references for named links to records returned by discovered operations, such as a saved approval. A reference is navigation, not proof of approval or authority. The returned Event reference confirms acceptance and its exact attachments. Your normal final answer is already recorded in the current Context. Use 'current_context' as the destination only when you intentionally want Context subscription/effect semantics.",
    inputSchema: EMIT_INPUT_SCHEMA
  },
  request: {
    name: "request",
    title: "Request Actor Work",
    description: "Ask one actor for work whose result you need before continuing. Attach the exact published ArtefactVersion IDs when the work concerns saved inputs. Floe stores the dependency, ends this processing cycle normally, and resumes you when that actor completes or fails. The return path is automatic.",
    inputSchema: REQUEST_INPUT_SCHEMA
  },
  discoverCapabilities: {
    name: "discover_capabilities",
    title: "Discover Capabilities",
    description: "Find current Bus operations for a concrete need. Search returns short summaries. Pass an operation_id from a summary to load its exact input contract before using it. Reuse a discovered contract within this turn; rediscover after a version or authority refusal.",
    inputSchema: DISCOVER_CAPABILITIES_INPUT_SCHEMA
  },
  useCapability: {
    name: "use_capability",
    title: "Use Capability",
    description: "Invoke one Bus semantic operation using the exact operation and input-schema versions returned by discover_capabilities. Authority and causal provenance come from the active Delivery, not from this input.",
    inputSchema: USE_CAPABILITY_INPUT_SCHEMA
  },
  createPulse: {
    name: "create_pulse",
    title: "Create Pulse",
    description: "Create a scheduled pulse that fires canonical pulse.fired events to its subscribers. Use trigger.type 'once' with trigger.at (or trigger.after_seconds) for a one-off, or 'cron' with trigger.schedule for recurring. Use a context subscriber to render a reminder in a conversation; use an endpoint subscriber to wake an actor. Use persistence 'workspace' to persist into committed floe.yaml, or 'local' (default) for a runtime-backed pulse.",
    inputSchema: CREATE_PULSE_INPUT_SCHEMA
  },
  listPulses: {
    name: "list_pulses",
    title: "List Pulses",
    description: "List pulses registered for this workspace. Optionally filter by status (active, paused, cancelled, fired).",
    inputSchema: LIST_PULSES_INPUT_SCHEMA
  },
  pausePulse: {
    name: "pause_pulse",
    title: "Pause Pulse",
    description: "Pause an active pulse. It stops firing until resumed.",
    inputSchema: PULSE_ID_INPUT_SCHEMA
  },
  resumePulse: {
    name: "resume_pulse",
    title: "Resume Pulse",
    description: "Resume a paused pulse. Cron pulses recompute their next fire from now.",
    inputSchema: PULSE_ID_INPUT_SCHEMA
  },
  cancelPulse: {
    name: "cancel_pulse",
    title: "Cancel Pulse",
    description: "Permanently cancel a pulse. This cannot be undone.",
    inputSchema: PULSE_ID_INPUT_SCHEMA
  },
  readArtefact: {
    name: "read_artefact",
    title: "Read Shared Content",
    description: "Read one exact ArtefactVersion shared into your work. Images enter your model context for visual inspection. Text returns a bounded page; use next_offset to read the remainder without rereading a mutable workspace file. Uses your active Delivery authority and verifies the saved content, up to 20MB.",
    inputSchema: READ_ARTEFACT_INPUT_SCHEMA
  }
};

// floe-bridge/dist/adapters/floe-direct-tools.js
function result(value) {
  return {
    textResultForLlm: value.content.filter((block) => block.type === "text").map((block) => block.text ?? "").join("\n"),
    binaryResultsForLlm: value.content.filter((block) => block.type === "image" && block.data && block.mimeType).map((block) => ({ data: block.data, mimeType: block.mimeType })),
    resultType: value.details.ok === false ? "failure" : "success"
  };
}
function resultCode(value) {
  const receipt = value.details.receipt;
  const refusal = receipt && typeof receipt === "object" ? receipt.refusal : value.details.refusal;
  if (refusal && typeof refusal === "object" && typeof refusal.code === "string") {
    return refusal.code;
  }
  return void 0;
}
function directTool(name, description, schema, handle, execute) {
  return {
    name,
    description,
    parameters: zodToJsonSchema(schema, { $refStrategy: "none" }),
    // The handler is the Bridge's authority boundary: it resolves the active
    // delivery and invokes the Bus with Bridge-only or delivery-scoped authority.
    skipPermission: true,
    async handler(args, invocation) {
      const callId = invocation.toolCallId;
      const normalizedArgs = args && typeof args === "object" && !Array.isArray(args) ? args : {};
      handle.recordToolActivity({
        name,
        call_id: callId,
        lifecycle: "started",
        provenance: FLOE_DIRECT_TOOL_CALLBACK_PROVENANCE,
        arguments: normalizedArgs
      });
      try {
        const execution = await execute(schema.parse(args), handle);
        const toolResult = result(execution);
        handle.recordToolActivity({
          name,
          call_id: callId,
          lifecycle: toolResult.resultType === "failure" ? "failed" : "completed",
          provenance: FLOE_DIRECT_TOOL_CALLBACK_PROVENANCE,
          is_error: toolResult.resultType === "failure",
          result_type: toolResult.resultType,
          result_value: toolResult.textResultForLlm,
          result_code: resultCode(execution)
        });
        return toolResult;
      } catch (error) {
        handle.recordToolActivity({
          name,
          call_id: callId,
          lifecycle: "failed",
          provenance: FLOE_DIRECT_TOOL_CALLBACK_PROVENANCE,
          is_error: true,
          result_type: "failure",
          result_value: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }
  };
}
function createDirectSubstrateTools(handle) {
  const active = (name) => {
    const turn = handle.getActiveTurn();
    if (!turn)
      throw new Error(`${name}: no active Floe turn is running for this session.`);
    return turn;
  };
  const tools = [
    directTool(SUBSTRATE_TOOL_DEFINITIONS.emit.name, SUBSTRATE_TOOL_DEFINITIONS.emit.description, SUBSTRATE_TOOL_DEFINITIONS.emit.inputSchema, handle, async (params, h) => {
      const anchor = h.getAnchor();
      if (!anchor)
        throw new Error("emit: no active Floe turn is running for this session.");
      const outcome = await executeEmit(h.getBus(), anchor, params, FLOE_RUNTIME_TOOL_IDENTITY);
      if (outcome.emitted)
        h.recordEmitted(outcome.emitted);
      return outcome.result;
    }),
    directTool(SUBSTRATE_TOOL_DEFINITIONS.request.name, SUBSTRATE_TOOL_DEFINITIONS.request.description, SUBSTRATE_TOOL_DEFINITIONS.request.inputSchema, handle, async (params, h) => {
      const anchor = h.getAnchor();
      if (!anchor)
        throw new Error("request: no active Floe turn is running for this session.");
      const outcome = await executeRequest(h.getBus(), anchor, params, FLOE_RUNTIME_TOOL_IDENTITY, h.isDependencyRequested());
      if (outcome.dependencyRequested)
        h.markDependencyRequested();
      if (outcome.emitted)
        h.recordEmitted(outcome.emitted);
      return outcome.result;
    }),
    directTool(SUBSTRATE_TOOL_DEFINITIONS.discoverCapabilities.name, SUBSTRATE_TOOL_DEFINITIONS.discoverCapabilities.description, SUBSTRATE_TOOL_DEFINITIONS.discoverCapabilities.inputSchema, handle, async (params, h) => executeDiscoverCapabilities(h.getBus(), active("discover_capabilities").workspace_id, active("discover_capabilities"), params)),
    directTool(SUBSTRATE_TOOL_DEFINITIONS.useCapability.name, SUBSTRATE_TOOL_DEFINITIONS.useCapability.description, SUBSTRATE_TOOL_DEFINITIONS.useCapability.inputSchema, handle, async (params, h) => executeUseCapability(h.getBus(), active("use_capability").workspace_id, active("use_capability"), params)),
    directTool(SUBSTRATE_TOOL_DEFINITIONS.createPulse.name, SUBSTRATE_TOOL_DEFINITIONS.createPulse.description, SUBSTRATE_TOOL_DEFINITIONS.createPulse.inputSchema, handle, async (params, h) => executeCreatePulse(h.getBus(), active("create_pulse"), params)),
    directTool(SUBSTRATE_TOOL_DEFINITIONS.listPulses.name, SUBSTRATE_TOOL_DEFINITIONS.listPulses.description, SUBSTRATE_TOOL_DEFINITIONS.listPulses.inputSchema, handle, async (params, h) => executeListPulses(h.getBus(), active("list_pulses"), params)),
    directTool(SUBSTRATE_TOOL_DEFINITIONS.pausePulse.name, SUBSTRATE_TOOL_DEFINITIONS.pausePulse.description, SUBSTRATE_TOOL_DEFINITIONS.pausePulse.inputSchema, handle, async (params, h) => {
      active("pause_pulse");
      return executePausePulse(h.getBus(), params);
    }),
    directTool(SUBSTRATE_TOOL_DEFINITIONS.resumePulse.name, SUBSTRATE_TOOL_DEFINITIONS.resumePulse.description, SUBSTRATE_TOOL_DEFINITIONS.resumePulse.inputSchema, handle, async (params, h) => {
      active("resume_pulse");
      return executeResumePulse(h.getBus(), params);
    }),
    directTool(SUBSTRATE_TOOL_DEFINITIONS.cancelPulse.name, SUBSTRATE_TOOL_DEFINITIONS.cancelPulse.description, SUBSTRATE_TOOL_DEFINITIONS.cancelPulse.inputSchema, handle, async (params, h) => {
      active("cancel_pulse");
      return executeCancelPulse(h.getBus(), params);
    }),
    directTool(SUBSTRATE_TOOL_DEFINITIONS.readArtefact.name, SUBSTRATE_TOOL_DEFINITIONS.readArtefact.description, SUBSTRATE_TOOL_DEFINITIONS.readArtefact.inputSchema, handle, async (params, h) => executeReadArtefact(h.getBus(), active("read_artefact"), params))
  ];
  return tools;
}

// floe-bridge/dist/adapters/turn-failed-error.js
var TurnFailedError = class extends Error {
  delivery_id;
  source_endpoint_id;
  workspace_id;
  context_id;
  thread_id;
  model_id;
  provider;
  http_status;
  code = "turn_failed";
  constructor(delivery_id, source_endpoint_id, workspace_id, context_id, thread_id, model_id, provider, http_status, message) {
    super(message);
    this.delivery_id = delivery_id;
    this.source_endpoint_id = source_endpoint_id;
    this.workspace_id = workspace_id;
    this.context_id = context_id;
    this.thread_id = thread_id;
    this.model_id = model_id;
    this.provider = provider;
    this.http_status = http_status;
    this.name = "TurnFailedError";
  }
};

// floe-bridge/dist/adapters/turn-usage.js
function turnUsage(usage) {
  if (!usage || typeof usage !== "object") {
    return { measurement_scope: "unmeasured", model_calls: null, tool_calls: null, tokens: null };
  }
  const record = usage;
  const modelCalls = count(record.numModelCalls);
  const wholeTurn = modelCalls !== null && modelCalls > 0;
  return {
    measurement_scope: wholeTurn ? "turn" : "last_model_call",
    model_calls: modelCalls,
    // Without the turn count, the SDK's per-call tool count says nothing about the turn.
    tool_calls: wholeTurn ? count(record.numToolCalls) : null,
    tokens: {
      input: tokens(record.inputTokens),
      output: tokens(record.outputTokens),
      cache_read: tokens(record.cacheReadTokens),
      cache_write: tokens(record.cacheWriteTokens)
    }
  };
}
function count(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}
function tokens(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// floe-bridge/dist/engines/copilot.js
import { createRequire } from "node:module";
function packagedCopilotCliPath() {
  const require2 = createRequire(import.meta.url);
  let launcher;
  try {
    launcher = require2.resolve("@github/copilot/package.json");
  } catch {
    return null;
  }
  const fromLauncher = createRequire(launcher);
  const platforms = process.platform !== "linux" ? [process.platform] : fromLauncher("detect-libc").isNonGlibcLinuxSync() ? ["linuxmusl", "linux"] : ["linux"];
  for (const platform of platforms) {
    try {
      return fromLauncher.resolve(`@github/copilot-${platform}-${process.arch}`);
    } catch {
    }
  }
  return null;
}
function copilotEnvironment(environment = process.env) {
  return copilotChildEnvironment(environment);
}
function createCopilotAccount(options = {}) {
  const cliPath = options.cliPath === void 0 ? packagedCopilotCliPath() : options.cliPath;
  if (cliPath)
    console.log(`[floe-bridge] copilot sign-in cli: ${cliPath}`);
  else
    console.warn("[floe-bridge] copilot sign-in cli: not found; @github/copilot for this platform is not installed");
  return new CopilotEngineAccountAdapter({
    environment: options.environment ?? process.env,
    ...cliPath ? { cliPath } : {}
  });
}

// floe-bridge/dist/adapters/floe-runtime-adapter.js
function recordToolActivity(turn, entry) {
  const existing = entry.call_id ? turn.tool_activity.find((activity) => activity.call_id === entry.call_id) : void 0;
  if (!existing) {
    turn.tool_activity.push(entry);
    return;
  }
  if (!existing.name && entry.name)
    existing.name = entry.name;
  if (entry.is_error !== void 0)
    existing.is_error = entry.is_error;
  if (entry.lifecycle !== void 0 && (existing.lifecycle === void 0 || entry.lifecycle !== "started"))
    existing.lifecycle = entry.lifecycle;
  if (entry.provenance !== void 0)
    existing.provenance = entry.provenance;
  if (entry.summary !== void 0)
    existing.summary = entry.summary;
  if (entry.duration_ms !== void 0)
    existing.duration_ms = entry.duration_ms;
  if (entry.arguments !== void 0)
    existing.arguments = entry.arguments;
  if (entry.result_type !== void 0)
    existing.result_type = entry.result_type;
  if (entry.result_value !== void 0)
    existing.result_value = entry.result_value;
  if (entry.result_code !== void 0)
    existing.result_code = entry.result_code;
}
var FloeRuntimeAdapter = class {
  name = "floe-runtime";
  engine = "copilot";
  // floe-runtime holds no credentials; the vendor CLI authenticates itself.
  sessions = /* @__PURE__ */ new Map();
  runtimeFactory;
  constructor(options) {
    this.runtimeFactory = options?.runtimeFactory ?? (() => new CopilotRuntime({ clientOptions: { env: copilotEnvironment() } }));
  }
  createEngineAccount() {
    return createCopilotAccount();
  }
  beginCancellation(session, turn) {
    if (!session.sessionId || turn.cancellation)
      return;
    turn.cancellation = session.runtime.quiesce(session.sessionId).catch((error) => {
      turn.cancellationFault = error;
    });
  }
  async throwIfCancelled(session, turn) {
    if (!turn.cancelled)
      return;
    this.beginCancellation(session, turn);
    await turn.cancellation;
    if (turn.cancellationFault)
      throw turn.cancellationFault;
    const interrupted = new Error("Runtime turn was cancelled before quiescence completed.");
    interrupted.code = "interrupted";
    throw interrupted;
  }
  async handleBundle(context, bundle, runtimeConfig) {
    const session = this.getOrCreateSession(context, bundle);
    if (session.activeTurn && !session.activeTurn.finalized) {
      throw new Error(`Runtime turn already active for endpoint '${bundle.endpoint_id}'.`);
    }
    const model = runtimeConfig?.model?.trim() || void 0;
    const freshSession = session.sessionId === null;
    const turn = this.startTurn(bundle);
    turn.operation_authority_session = context.operation_authority_session ?? null;
    session.activeTurn = turn;
    if (turn.context_id) {
      try {
        const ctx = await context.bus.getContext(turn.context_id);
        if (ctx && typeof ctx.scope_id === "string" && ctx.scope_id.trim())
          turn.scope_id = ctx.scope_id;
      } catch (ctxErr) {
        console.warn("[bridge] getContext failed; continuing with delivery identity", {
          context_id: turn.context_id,
          error: ctxErr instanceof Error ? ctxErr.message : String(ctxErr)
        });
      }
    }
    if (freshSession && context.hooks?.hasHandlers("SessionStart")) {
      await context.hooks.fire("SessionStart", {
        endpoint_id: bundle.endpoint_id,
        workspace_id: bundle.workspace_id,
        delivery_id: bundle.delivery_id,
        trigger_event_id: bundle.trigger_event_id,
        provider: this.name,
        model_id: model ?? "(default)",
        reason: "session_created"
      });
    }
    let injectedContext = "";
    if (context.hooks?.hasHandlers("BeforeTurn")) {
      const origin = turn.context_id ? { id: turn.context_id, kind: "context" } : { id: turn.thread_id, kind: "thread" };
      const hookResults = await context.hooks.fire("BeforeTurn", {
        endpoint_id: bundle.endpoint_id,
        workspace_id: bundle.workspace_id,
        delivery_id: bundle.delivery_id,
        trigger_event_id: bundle.trigger_event_id,
        thread_id: turn.thread_id,
        origin
      });
      injectedContext = renderHookInjections(hookResults);
    }
    const parts = [];
    if (injectedContext)
      parts.push(injectedContext);
    parts.push(deliveryToPrompt(bundle));
    const prompt = parts.join("\n\n");
    await this.throwIfCancelled(session, turn);
    const cwd = context.workspace_locator ?? process.cwd();
    const systemMessage = freshSession ? buildSystemPrompt(runtimeConfig?.instructions?.trim() ?? "") : "";
    console.log("[bridge] floe-runtime prompt injected", {
      delivery_id: bundle.delivery_id,
      runtime_turn_id: turn.runtime_turn_id,
      endpoint_id: bundle.endpoint_id,
      fresh_session: freshSession,
      model: model ?? "(default)",
      prompt_length: prompt.length,
      // Instructions reach the model only as the system message of a new
      // session; a resumed session already holds them, so this is 0 there.
      system_message_bytes: systemMessage.length
    });
    try {
      await this.throwIfCancelled(session, turn);
      if (session.sessionId && model && session.model !== model) {
        await session.runtime.setModel(session.sessionId, model);
      }
      const result2 = await session.runtime.run("actor", { prompt }, cwd, async (sessionId) => {
        session.sessionId = sessionId;
        turn.thread_id = sessionId;
        await this.throwIfCancelled(session, turn);
      }, {
        ...model ? { model } : {},
        ...session.directTools.length ? {
          tools: session.directTools,
          availableTools: session.directTools.map((tool) => tool.name)
        } : {},
        ...systemMessage ? { systemMessage: { mode: "append", content: systemMessage } } : {}
      }, session.sessionId ? { sessionId: session.sessionId, scope: session.contextId } : { scope: session.contextId });
      await this.throwIfCancelled(session, turn);
      turn.visible_output = typeof result2.text === "string" ? result2.text : "";
      if (model)
        session.model = model;
      await this.appendTelemetry(context, turn, "sdk_tool_evidence", {
        sdk_session_id: result2.sessionId,
        offered_tool_names: session.directTools.map((tool) => tool.name),
        registration_acknowledgement: {
          exposed: false,
          reason: "copilot_sdk_does_not_expose_tool_registration_acknowledgement"
        },
        exposure_proof: turn.tool_activity.length > 0 ? {
          kind: "first_exact_callback",
          tool_call_id: turn.tool_activity[0]?.call_id ?? null
        } : null,
        tool_calls: turn.tool_activity
      });
      await this.recordUsage(context, turn, result2);
      await this.finalizeTurn(context, turn, result2);
      if (context.hooks?.hasHandlers("TurnEnd")) {
        await context.hooks.fire("TurnEnd", {
          endpoint_id: bundle.endpoint_id,
          workspace_id: bundle.workspace_id,
          delivery_id: bundle.delivery_id,
          trigger_event_id: bundle.trigger_event_id,
          visible_output: turn.visible_output,
          tool_activity: turn.tool_activity,
          emitted_events: turn.emitted_events
        });
      }
      this.writeWorkLog(context, bundle, turn, "completed");
    } catch (caught) {
      let error = caught;
      if (turn.cancelled) {
        this.beginCancellation(session, turn);
        await turn.cancellation;
        if (turn.cancellationFault)
          error = turn.cancellationFault;
      }
      const faultCode = typeof error?.code === "string" ? error.code : null;
      const errorMessage = faultCode ? `[${faultCode}] ${error instanceof Error ? error.message : String(error)}` : error instanceof Error ? error.message : String(error);
      const httpStatus = (() => {
        const status = error?.httpStatus ?? error?.status;
        if (typeof status === "number")
          return status;
        const m = errorMessage.match(/:\s*(\d{3})\b/);
        return m ? parseInt(m[1], 10) : null;
      })();
      console.error("[bridge] floe-runtime error", {
        delivery_id: bundle.delivery_id,
        runtime_turn_id: turn.runtime_turn_id,
        endpoint_id: bundle.endpoint_id,
        http_status: httpStatus,
        error: errorMessage
      });
      await this.appendTelemetry(context, turn, "runtime_error", {
        error_message: errorMessage,
        fault_code: faultCode,
        http_status: httpStatus,
        provider: this.name,
        model: model ?? "(default)"
      });
      if (context.hooks?.hasHandlers("Error")) {
        await context.hooks.fire("Error", {
          endpoint_id: bundle.endpoint_id,
          workspace_id: bundle.workspace_id,
          delivery_id: bundle.delivery_id,
          trigger_event_id: bundle.trigger_event_id,
          error: errorMessage
        });
      }
      turn.finalized = true;
      if (session.activeTurn === turn)
        session.activeTurn = void 0;
      this.writeWorkLog(context, bundle, turn, "error");
      throw new TurnFailedError(bundle.delivery_id, turn.source_endpoint_id, bundle.workspace_id, turn.context_id, turn.thread_id, model ?? "(default)", this.name, httpStatus, errorMessage);
    }
  }
  cancelDelivery(deliveryId) {
    for (const session of this.sessions.values()) {
      const turn = session.activeTurn;
      if (!turn || turn.delivery_id !== deliveryId || turn.finalized)
        continue;
      turn.cancelled = true;
      this.beginCancellation(session, turn);
      return true;
    }
    return false;
  }
  async dispose(_reason = "bridge_shutdown") {
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    for (const session of sessions) {
      try {
        await session.runtime.close();
      } catch (err) {
        console.error("[bridge] floe-runtime close failed", { endpoint_id: session.endpointId, error: String(err) });
      }
    }
  }
  getOrCreateSession(context, bundle) {
    const contextId = bundle.context_id ?? bundle.events[0]?.context_id ?? "no-context";
    const key = `${bundle.endpoint_id}:${contextId}`;
    const existing = this.sessions.get(key);
    if (existing) {
      existing.context = context;
      return existing;
    }
    const runtime = this.runtimeFactory();
    const session = {
      runtime,
      sessionId: null,
      endpointId: bundle.endpoint_id,
      contextId,
      workspaceId: bundle.workspace_id,
      directTools: [],
      context
    };
    const toolHandle = {
      getBus: () => session.context?.bus ?? context.bus,
      getAnchor: () => session.activeTurn && !session.activeTurn.finalized && !session.activeTurn.cancelled ? this.turnAnchor(session.activeTurn) : null,
      getActiveTurn: () => {
        const turn = session.activeTurn;
        if (!turn || turn.finalized || turn.cancelled)
          return null;
        return {
          workspace_id: turn.workspace_id,
          context_id: turn.context_id,
          workspace_locator: session.context?.workspace_locator ?? null,
          delivery_id: turn.delivery_id,
          get processing_contract_id() {
            return turn.processing_contract_id;
          },
          set processing_contract_id(value) {
            turn.processing_contract_id = value;
          },
          get operation_authority_session() {
            return turn.operation_authority_session;
          },
          set operation_authority_session(value) {
            turn.operation_authority_session = value;
          }
        };
      },
      isDependencyRequested: () => session.activeTurn?.dependency_requested ?? true,
      markDependencyRequested: () => {
        if (session.activeTurn)
          session.activeTurn.dependency_requested = true;
      },
      recordEmitted: (summary) => {
        session.activeTurn?.emitted_events.push(summary);
      },
      recordToolActivity: (entry) => {
        const turn = session.activeTurn;
        if (!turn || turn.finalized)
          return;
        recordToolActivity(turn, entry);
      }
    };
    session.directTools = createDirectSubstrateTools(toolHandle);
    runtime.on("activity", (event) => {
      const turn = session.activeTurn;
      if (!turn || turn.finalized)
        return;
      if (event.status === "started") {
        recordToolActivity(turn, {
          name: event.title || event.kind,
          call_id: event.id,
          lifecycle: "started"
        });
      } else {
        recordToolActivity(turn, {
          name: event.title || event.kind,
          call_id: event.id,
          lifecycle: event.status === "failed" ? "failed" : "completed",
          is_error: event.status === "failed"
        });
      }
    });
    runtime.on("diagnostic", (text) => {
      console.log("[bridge] floe-runtime diagnostic", { endpoint_id: session.endpointId, text });
    });
    this.sessions.set(key, session);
    return session;
  }
  startTurn(bundle) {
    const trigger = bundle.events[0];
    const contextId = bundle.context_id ?? trigger?.context_id ?? null;
    const threadId = contextId ?? trigger?.thread_id ?? `thread:${bundle.workspace_id}:floe-runtime`;
    const sourceEndpoint = trigger?.source_endpoint_id || `actor:${bundle.workspace_id}:operator`;
    return {
      runtime_turn_id: `rt_${randomUUID5()}`,
      delivery_id: bundle.delivery_id,
      started_at: (/* @__PURE__ */ new Date()).toISOString(),
      endpoint_id: bundle.endpoint_id,
      workspace_id: bundle.workspace_id,
      thread_id: threadId,
      context_id: contextId,
      scope_id: typeof trigger?.scope_id === "string" && trigger.scope_id.trim() ? trigger.scope_id : null,
      scope_execution_id: bundle.scope_execution_id ?? null,
      node_execution_id: bundle.node_execution_id ?? null,
      target_node_id: bundle.target_node_id ?? null,
      composition_revision_id: bundle.composition_revision_id ?? null,
      invocation_request_event_id: trigger?.type === "request" ? trigger.event_id ?? null : trigger?.type === "request.result" && typeof trigger.metadata?.request_continuation_event_id === "string" ? trigger.metadata.request_continuation_event_id : null,
      source_endpoint_id: sourceEndpoint,
      trigger_event_id: trigger?.event_id ?? `evt:${bundle.delivery_id}`,
      execution_attempt_id: bundle.execution_attempt_id ?? null,
      operation_authority_session: null,
      processing_contract_id: bundle.processing_contract?.processing_contract_id ?? null,
      visible_output: "",
      tool_activity: [],
      emitted_events: [],
      dependency_requested: false,
      finalized: false,
      cancelled: false,
      cancellation: null,
      cancellationFault: null
    };
  }
  /** Build the neutral write-back anchor the substrate tools require. */
  turnAnchor(turn) {
    return {
      workspace_id: turn.workspace_id,
      endpoint_id: turn.endpoint_id,
      thread_id: turn.thread_id,
      context_id: turn.context_id,
      runtime_turn_id: turn.runtime_turn_id,
      delivery_id: turn.delivery_id,
      execution_attempt_id: turn.execution_attempt_id,
      scope_execution_id: turn.scope_execution_id,
      composition_revision_id: turn.composition_revision_id,
      node_execution_id: turn.node_execution_id,
      target_node_id: turn.target_node_id,
      invocation_request_event_id: turn.invocation_request_event_id
    };
  }
  async finalizeTurn(context, turn, result2) {
    if (turn.finalized)
      return;
    turn.finalized = true;
    const output = turn.visible_output.trim();
    const recorded = await context.bus.recordRuntimeTurnResult({
      delivery_id: turn.delivery_id,
      outcome: "completed",
      text: output,
      metadata: {
        runtime: this.name,
        runtime_turn_id: turn.runtime_turn_id,
        execution_attempt_id: turn.execution_attempt_id,
        node_execution_id: turn.node_execution_id,
        composition_revision_id: turn.composition_revision_id,
        stop_reason: result2.stopReason,
        session_id: result2.sessionId
      }
    });
    console.log("[bridge] floe-runtime turn result recorded", {
      runtime_turn_id: turn.runtime_turn_id,
      delivery_id: turn.delivery_id,
      output_length: output.length,
      request_resolved: recorded.request_resolved
    });
    await this.appendTelemetry(context, turn, "turn_result", {
      text: output,
      result_event_id: recorded.result_event.event_id,
      request_resolved: recorded.request_resolved,
      return_event_id: recorded.return_event?.event_id ?? null,
      stop_reason: result2.stopReason
    });
  }
  async recordUsage(context, turn, result2) {
    await this.appendTelemetry(context, turn, "visible_output", { text: turn.visible_output });
    await this.appendTelemetry(context, turn, "usage", {
      ...turnUsage(result2.usage),
      usage: result2.usage ?? null,
      stop_reason: result2.stopReason,
      elapsed_ms: result2.elapsedMs
    });
  }
  async appendTelemetry(context, turn, kind, payload) {
    await context.bus.appendRuntimeTelemetry({
      workspace_id: turn.workspace_id,
      endpoint_id: turn.endpoint_id,
      delivery_id: turn.delivery_id,
      kind,
      payload: {
        runtime_turn_id: turn.runtime_turn_id,
        delivery_id: turn.delivery_id,
        execution_attempt_id: turn.execution_attempt_id,
        node_execution_id: turn.node_execution_id,
        composition_revision_id: turn.composition_revision_id,
        endpoint_id: turn.endpoint_id,
        thread_id: turn.thread_id,
        scope_id: turn.scope_id,
        started_at: turn.started_at,
        trigger_event_id: turn.trigger_event_id,
        context_id: turn.context_id,
        ...payload
      }
    });
  }
  writeWorkLog(context, bundle, turn, outcome) {
    if (!context.workspace_locator || !context.agent_id)
      return;
    const entry = {
      runtime_turn_id: turn.runtime_turn_id,
      agent_id: context.agent_id,
      started_at: turn.started_at,
      ended_at: (/* @__PURE__ */ new Date()).toISOString(),
      trigger_type: bundle.events?.[0]?.type ?? "unknown",
      scope_id: turn.scope_id,
      thread_id: turn.thread_id,
      delivery_id: turn.delivery_id,
      delivered_events: (bundle.events ?? []).map((e) => ({
        event_id: e.event_id ?? "unknown",
        type: e.type ?? "unknown",
        source_endpoint_id: e.source_endpoint_id ?? "unknown",
        text: (e.content?.text ?? JSON.stringify(e.content ?? "")).slice(0, 200)
      })),
      visible_output: turn.visible_output || null,
      tool_activity: turn.tool_activity ?? [],
      emitted_events: turn.emitted_events ?? [],
      lifecycle_outcome: outcome
    };
    try {
      appendWorkLog(context.workspace_locator, entry);
    } catch (err) {
      console.error("[bridge] work-log write failed", { agent_id: context.agent_id, error: String(err) });
    }
  }
};

// floe-bridge/dist/hooks.js
var HookRegistry = class {
  handlers = /* @__PURE__ */ new Map();
  /** Register a handler for a hook. */
  on(hook, extensionName, handler) {
    if (!this.handlers.has(hook)) {
      this.handlers.set(hook, []);
    }
    this.handlers.get(hook).push({ extensionName, handler });
  }
  /** Remove all handlers registered by an extension. */
  removeAll(extensionName) {
    for (const [, handlers] of this.handlers) {
      const filtered = handlers.filter((h) => h.extensionName !== extensionName);
      handlers.length = 0;
      handlers.push(...filtered);
    }
  }
  /** Fire a hook — runs all handlers sequentially, collects results. */
  async fire(hook, payload) {
    const handlers = this.handlers.get(hook) ?? [];
    const results = [];
    for (const { extensionName, handler } of handlers) {
      try {
        const result2 = await handler(payload);
        if (result2 && typeof result2 === "object" && "inject" in result2) {
          results.push(result2);
        }
      } catch (error) {
        console.error(`[hooks] ${hook} handler from extension '${extensionName}' failed`, error);
      }
    }
    return results;
  }
  /** Check if any handlers are registered for a hook. */
  hasHandlers(hook) {
    return (this.handlers.get(hook)?.length ?? 0) > 0;
  }
  /** List all hooks that have registered handlers with their counts. */
  listRegistered() {
    const result2 = [];
    for (const [hook, handlers] of this.handlers) {
      if (handlers.length > 0) {
        result2.push({ hook, count: handlers.length });
      }
    }
    return result2;
  }
};

// floe-bridge/dist/folder-watcher.js
import { createHash as createHash4 } from "node:crypto";
import { statSync as statSync3, watch as fsWatch } from "node:fs";
import { extname, join as join7, resolve as resolve4 } from "node:path";
function watchFolder(folderPath, onFile, options = {}) {
  let watcher;
  const settleMs = Math.max(0, options.settle_ms ?? 250);
  const extensions = new Set((options.extensions ?? []).map((value) => {
    const normalized = value.trim().toLowerCase();
    return normalized.startsWith(".") ? normalized : `.${normalized}`;
  }).filter((value) => value.length > 1));
  const pending = /* @__PURE__ */ new Map();
  const lastArrivalByPath = /* @__PURE__ */ new Map();
  const observe = (filePath, fileName) => {
    pending.delete(filePath);
    if (extensions.size > 0 && !extensions.has(extname(fileName).toLowerCase()))
      return;
    let stat;
    try {
      stat = statSync3(filePath);
    } catch {
      return;
    }
    if (!stat.isFile())
      return;
    const arrivalId = createHash4("sha256").update(`${resolve4(filePath).toLowerCase()}\0${stat.size}\0${stat.mtimeMs}`).digest("hex");
    if (lastArrivalByPath.get(filePath) === arrivalId)
      return;
    lastArrivalByPath.set(filePath, arrivalId);
    onFile({
      arrival_id: arrivalId,
      file_path: filePath,
      file_name: fileName,
      observed_at: (/* @__PURE__ */ new Date()).toISOString()
    });
  };
  try {
    watcher = fsWatch(folderPath, { persistent: false }, (_eventType, filename) => {
      if (!filename)
        return;
      const fileName = filename.toString();
      const filePath = join7(folderPath, fileName);
      const existing = pending.get(filePath);
      if (existing)
        clearTimeout(existing);
      pending.set(filePath, setTimeout(() => observe(filePath, fileName), settleMs));
    });
  } catch (error) {
    console.error("[bridge] folder watcher failed to start", { folderPath, error });
    return () => {
    };
  }
  return () => {
    for (const timer of pending.values())
      clearTimeout(timer);
    pending.clear();
    watcher.close();
  };
}

// floe-bridge/dist/runtime-processing-contract.js
var PinnedRuntimeContractError = class extends Error {
  reason;
  code = "runtime_processing_contract_invalid";
  constructor(reason) {
    super(`Pinned runtime processing contract is invalid: ${reason}`);
    this.reason = reason;
    this.name = "PinnedRuntimeContractError";
  }
};
function selectPinnedRuntime(contract) {
  assertContractPins(contract);
  const configuration = contract.runtime.profile.content.configuration;
  const provider = optionalString(configuration.provider, "configuration.provider");
  const model = optionalString(configuration.model, "configuration.model");
  const authProfile = optionalString(configuration.auth_profile ?? configuration.auth_profile_id, "configuration.auth_profile");
  const thinkingLevel = optionalThinkingLevel(configuration.thinking_level);
  const actorInstructions = contract.actor.definition.content.instructions.trim();
  const placementInstructions = contract.contract_kind === "scope_node" ? (contract.placement.bindings ?? []).filter((binding) => binding.kind === "instructions" && binding.text.trim().length > 0).map((binding) => binding.text.trim()) : [];
  return Object.freeze({
    adapter_id: requiredString(contract.runtime.profile.content.adapter_id, "adapter_id"),
    config: Object.freeze({
      ...provider ? { provider } : {},
      ...model ? { model, model_source: "runtime_profile_revision" } : {},
      ...authProfile ? {
        auth_profile: authProfile,
        auth_profile_source: "runtime_profile_revision"
      } : {},
      ...thinkingLevel ? { thinking_level: thinkingLevel } : {},
      ...actorInstructions || placementInstructions.length > 0 ? { instructions: [actorInstructions, ...placementInstructions].filter(Boolean).join("\n\n") } : {}
    }),
    secret_ref_ids: Object.freeze([...contract.runtime.profile.content.secret_ref_ids]),
    resource_policy: Object.freeze({ ...contract.runtime.profile.content.resource_policy })
  });
}
function assertContractPins(contract) {
  if (contract.contract_version !== 1)
    fail("unsupported contract version");
  if (contract.workspace_id !== contract.actor.definition.workspace_id || contract.workspace_id !== contract.runtime.binding.workspace_id) {
    fail("Actor or runtime binding belongs to another Workspace");
  }
  if (contract.actor.definition.actor_id !== contract.actor.actor_id) {
    fail("Actor definition belongs to another Actor");
  }
  if (contract.runtime.binding.actor_id !== contract.actor.actor_id) {
    fail("runtime binding belongs to another Actor");
  }
  if (contract.runtime.binding.runtime_profile_revision_id !== contract.runtime.profile.runtime_profile_revision_id) {
    fail("runtime binding and runtime profile pins do not match");
  }
  if (contract.contract_kind === "direct_context") {
    if (contract.context.context_id !== contract.delivery.context_id) {
      fail("Context reference does not match the direct Delivery");
    }
    if (contract.runtime.binding.endpoint_id !== contract.delivery.endpoint_id) {
      fail("runtime binding does not own the direct Delivery Endpoint");
    }
    return;
  }
  if (contract.context.context_id !== contract.node_execution.context_id) {
    fail("Context reference does not match the NodeExecution");
  }
  if (contract.placement.node_id !== contract.node_execution.node_id || contract.placement.resource_id !== contract.actor.actor_id) {
    fail("Actor placement does not match the NodeExecution and Actor");
  }
  if (contract.execution_attempt.node_execution_id !== contract.node_execution.node_execution_id) {
    fail("ExecutionAttempt does not belong to the NodeExecution");
  }
  if (contract.actor.definition.actor_definition_revision_id !== contract.node_execution.actor_definition_revision_id || contract.execution_attempt.actor_definition_revision_id !== contract.node_execution.actor_definition_revision_id) {
    fail("Actor definition pins do not match");
  }
  if (contract.runtime.profile.runtime_profile_revision_id !== contract.node_execution.runtime_profile_revision_id || contract.execution_attempt.runtime_profile_revision_id !== contract.node_execution.runtime_profile_revision_id) {
    fail("runtime profile pins do not match");
  }
  if (contract.runtime.binding.actor_runtime_binding_id !== contract.node_execution.actor_runtime_binding_id || contract.execution_attempt.actor_runtime_binding_id !== contract.node_execution.actor_runtime_binding_id) {
    fail("Actor runtime binding pins do not match");
  }
}
function optionalString(value, label) {
  if (value === void 0 || value === null || value === "")
    return void 0;
  if (typeof value !== "string" || !value.trim())
    fail(`${label} must be a non-empty string`);
  return value.trim();
}
function requiredString(value, label) {
  const result2 = optionalString(value, label);
  if (!result2)
    fail(`${label} is required`);
  return result2;
}
function optionalThinkingLevel(value) {
  if (value === void 0 || value === null || value === "")
    return void 0;
  if (!(value === "off" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh")) {
    fail("configuration.thinking_level is unsupported");
  }
  return value;
}
function fail(reason) {
  throw new PinnedRuntimeContractError(reason);
}

// floe-bridge/dist/workspace-config-inventory.js
import { createHash as createHash5 } from "node:crypto";
import { isAbsolute as isAbsolute3 } from "node:path";
var WorkspaceConfigurationInventoryError = class extends Error {
  reason;
  code = "workspace_configuration_inventory_invalid";
  constructor(reason) {
    super(`Workspace configuration inventory is invalid: ${reason}`);
    this.reason = reason;
    this.name = "WorkspaceConfigurationInventoryError";
  }
};
function buildWorkspaceConfigurationInventory(input) {
  const bindingId = requiredText(input.binding_id, "binding_id");
  const configHash = requiredText(input.project.config_hash, "config_hash");
  if (!/^sha256:[a-f0-9]{64}$/i.test(configHash)) {
    throw new WorkspaceConfigurationInventoryError("config_hash must be a SHA-256 digest");
  }
  const runtimeByActor = /* @__PURE__ */ new Map();
  for (const runtime of input.runtimes) {
    const agentId = requiredText(runtime.agent_id, "runtime agent_id");
    if (runtimeByActor.has(agentId)) {
      throw new WorkspaceConfigurationInventoryError(`duplicate runtime observation for Actor '${agentId}'`);
    }
    runtimeByActor.set(agentId, runtime);
  }
  const seenActors = /* @__PURE__ */ new Set();
  const actors = input.project.agents.map((agent) => {
    const sourceActorId = requiredText(agent.agent_id, "Actor id");
    if (seenActors.has(sourceActorId)) {
      throw new WorkspaceConfigurationInventoryError(`duplicate Actor '${sourceActorId}'`);
    }
    seenActors.add(sourceActorId);
    const runtime = runtimeByActor.get(sourceActorId);
    if (!runtime) {
      throw new WorkspaceConfigurationInventoryError(`runtime observation is missing for Actor '${sourceActorId}'`);
    }
    return actorInventory(agent, runtime);
  }).sort((left, right) => left.source_actor_id.localeCompare(right.source_actor_id));
  for (const agentId of runtimeByActor.keys()) {
    if (!seenActors.has(agentId)) {
      throw new WorkspaceConfigurationInventoryError(`runtime observation names unknown Actor '${agentId}'`);
    }
  }
  return {
    schema: "floe.workspace-configuration-inventory.v1",
    importer_version: "1",
    binding_id: bindingId,
    config_hash: configHash.toLowerCase(),
    source: { kind: "workspace_files", manifest_ref: ".floe/floe.yaml" },
    validation: normalizeValidation(input.project.validation),
    actors
  };
}
function actorInventory(agent, runtime) {
  const sourcePath = safeWorkspacePath(agent.file);
  const label = requiredText(agent.name, `Actor '${agent.agent_id}' label`);
  const instructions = requiredText(agent.body, `Actor '${agent.agent_id}' instructions`);
  const adapterId = requiredText(runtime.adapter_id, `Actor '${agent.agent_id}' runtime adapter`);
  const frontmatter = agent.frontmatter ?? {};
  const configuration = {};
  if (cleanText(runtime.provider))
    configuration.provider = cleanText(runtime.provider);
  if (cleanText(runtime.model))
    configuration.model = cleanText(runtime.model);
  if (cleanText(runtime.thinking_level))
    configuration.thinking_level = cleanText(runtime.thinking_level);
  assertSafeJson(runtime.resource_policy ?? {}, "resource_policy");
  const definition = {
    label,
    charter: cleanText(frontmatter.charter) ?? `Carry out the responsibilities assigned to ${label} in this Workspace.`,
    responsibilities: parseResponsibilities(frontmatter.responsibilities),
    instructions,
    knowledge_refs: parseRefs(frontmatter.knowledge_refs),
    policy_refs: parsePolicyRefs(frontmatter.policy_refs),
    escalation_rules: parseEscalationRules(frontmatter.escalation_rules)
  };
  const checkpointPolicy = normalizeCheckpointPolicy(runtime.checkpoint_policy);
  const runtimeInventory = {
    label: `${label} runtime`,
    backing_kind: runtime.backing_kind ?? "model",
    adapter_id: adapterId,
    configuration,
    required_capability_ids: normalizeTextSet(runtime.required_capability_ids ?? []),
    checkpoint_policy: checkpointPolicy,
    resource_policy: runtime.resource_policy ?? {},
    credential_requirement: runtime.credential_requirement ?? "required",
    required_configuration_keys: normalizeTextSet(runtime.required_configuration_keys ?? ((runtime.backing_kind ?? "model") === "model" ? ["model"] : []))
  };
  return {
    source_actor_id: requiredText(agent.agent_id, "Actor id"),
    source: {
      kind: "workspace_actor_file",
      path: sourcePath,
      source_fingerprint: sha256(canonicalJson({
        file: sourcePath,
        name: label,
        frontmatter,
        body: instructions
      }))
    },
    definition,
    runtime: runtimeInventory
  };
}
function normalizeValidation(validation) {
  const issues = [];
  for (const warning of validation.warnings) {
    issues.push(classifyValidationIssue("warning", warning));
  }
  for (const error of validation.errors) {
    issues.push(classifyValidationIssue("error", error));
  }
  return {
    ok: validation.ok && issues.every((issue) => issue.severity !== "error"),
    issues: issues.sort((left, right) => left.severity.localeCompare(right.severity) || left.code.localeCompare(right.code) || (left.source_ref ?? "").localeCompare(right.source_ref ?? ""))
  };
}
function classifyValidationIssue(severity, message) {
  if (message === ".floe folder is missing") {
    return { severity, code: "workspace_config_directory_missing", source_ref: ".floe" };
  }
  if (message === ".floe/floe.yaml is missing") {
    return { severity, code: "workspace_manifest_missing", source_ref: ".floe/floe.yaml" };
  }
  if (message.includes("schema is not floe.workspace.v1")) {
    return { severity, code: "workspace_manifest_schema_legacy", source_ref: ".floe/floe.yaml" };
  }
  if (message.startsWith("Unable to parse .floe/floe.yaml")) {
    return { severity, code: "workspace_manifest_invalid", source_ref: ".floe/floe.yaml" };
  }
  if (message.startsWith("Agent file is missing:")) {
    const ref = message.slice("Agent file is missing:".length).trim();
    return {
      severity,
      code: "actor_definition_missing",
      source_ref: ref ? safeWorkspacePath(ref) : null
    };
  }
  return { severity, code: "workspace_config_validation_issue", source_ref: null };
}
function parseResponsibilities(value) {
  if (!Array.isArray(value))
    return [];
  return value.map((item, index) => {
    const object = plainObject(item, `responsibilities[${index}]`);
    return {
      responsibility_id: requiredText(object.responsibility_id, `responsibilities[${index}].responsibility_id`),
      title: requiredText(object.title, `responsibilities[${index}].title`),
      description: requiredText(object.description, `responsibilities[${index}].description`)
    };
  });
}
function parseRefs(value) {
  if (!Array.isArray(value))
    return [];
  return value.map((item, index) => parseRef(item, `knowledge_refs[${index}]`));
}
function parsePolicyRefs(value) {
  if (value === void 0 || value === null)
    return { budget: null, trust: null, approval: null };
  const object = plainObject(value, "policy_refs");
  return {
    budget: object.budget == null ? null : parseRef(object.budget, "policy_refs.budget"),
    trust: object.trust == null ? null : parseRef(object.trust, "policy_refs.trust"),
    approval: object.approval == null ? null : parseRef(object.approval, "policy_refs.approval")
  };
}
function parseRef(value, label) {
  const object = plainObject(value, label);
  return {
    kind: requiredText(object.kind, `${label}.kind`),
    id: requiredText(object.id, `${label}.id`),
    revision: object.revision == null ? null : requiredText(object.revision, `${label}.revision`)
  };
}
function parseEscalationRules(value) {
  if (!Array.isArray(value))
    return [];
  const actions = /* @__PURE__ */ new Set(["decline", "delegate", "escalate", "signal_unowned"]);
  return value.map((item, index) => {
    const object = plainObject(item, `escalation_rules[${index}]`);
    const action = requiredText(object.action, `escalation_rules[${index}].action`);
    if (!actions.has(action)) {
      throw new WorkspaceConfigurationInventoryError(`escalation_rules[${index}].action is invalid`);
    }
    return {
      rule_id: requiredText(object.rule_id, `escalation_rules[${index}].rule_id`),
      when: requiredText(object.when, `escalation_rules[${index}].when`),
      action,
      ...object.target_actor_id == null ? {} : { target_actor_id: requiredText(object.target_actor_id, `escalation_rules[${index}].target_actor_id`) }
    };
  });
}
function normalizeCheckpointPolicy(value) {
  if (!value)
    return { mode: "none", schema_ref: null };
  if (value.mode === "required" && !cleanText(value.schema_ref)) {
    throw new WorkspaceConfigurationInventoryError("required checkpoint policy must name a schema_ref");
  }
  if (value.mode === "none" && value.schema_ref !== null) {
    throw new WorkspaceConfigurationInventoryError("disabled checkpoint policy cannot name a schema_ref");
  }
  return {
    mode: value.mode,
    schema_ref: value.schema_ref == null ? null : requiredText(value.schema_ref, "checkpoint schema_ref")
  };
}
function safeWorkspacePath(value) {
  const path2 = requiredText(value, "workspace-relative source path").replace(/\\/g, "/");
  if (isAbsolute3(path2) || path2.startsWith("/") || path2.split("/").includes("..")) {
    throw new WorkspaceConfigurationInventoryError("source path must stay within the Workspace");
  }
  return path2.replace(/^\.\//, "");
}
function plainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkspaceConfigurationInventoryError(`${label} must be an object`);
  }
  return value;
}
function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new WorkspaceConfigurationInventoryError(`${label} must be non-empty text`);
  }
  return value.trim();
}
function cleanText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function normalizeTextSet(values) {
  return [...new Set(values.map((value) => requiredText(value, "runtime capability id")))].sort((left, right) => left.localeCompare(right));
}
function assertSafeJson(value, path2) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value))
    return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeJson(item, `${path2}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    throw new WorkspaceConfigurationInventoryError(`${path2} must contain JSON data only`);
  }
  for (const [key, item] of Object.entries(value)) {
    if (/api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|bearer[_-]?token|authorization|client[_-]?secret|private[_-]?key|password|secret|credential/i.test(key)) {
      throw new WorkspaceConfigurationInventoryError(`${path2}.${key} must not contain secret material`);
    }
    assertSafeJson(item, `${path2}.${key}`);
  }
}
function sha256(value) {
  return `sha256:${createHash5("sha256").update(value, "utf8").digest("hex")}`;
}
function canonicalJson(value) {
  if (Array.isArray(value))
    return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([, item]) => item !== void 0).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// floe-bridge/dist/daemon.js
var WEBHOOK_DEDUPE_MAX_EVENTS = 1e4;
var STREAM_INITIAL_BACKOFF_MS = 250;
var STREAM_MAX_BACKOFF_MS = 16e3;
var BridgeDaemon = class {
  configPath;
  config;
  bridgeId;
  bus;
  adapter;
  /** Engine readiness: gates work, and is served to surfaces by the process entry (index.ts). */
  engines;
  #bridgeServiceToken;
  /** Endpoints whose work is held until their engine is ready, keyed to that engine. */
  heldForEngine = /* @__PURE__ */ new Map();
  endpointRuntime = /* @__PURE__ */ new Map();
  workspaceLocators = /* @__PURE__ */ new Map();
  workspaceHooks = /* @__PURE__ */ new Map();
  /**
   * Node-specific instructions bindings, keyed by `${endpoint_id}:${context_id}` — an actor
   * node's own material, injected into that actor's turns arising from that node's Context
   * via the BeforeTurn hook (same inject-once mechanism extension overlays already use).
   * Never merged into the actor's general `.floe/agents/*.md` instructions.
   */
  nodeInstructionBindings = /* @__PURE__ */ new Map();
  workspaceWatchers = /* @__PURE__ */ new Map();
  attachmentPass = null;
  attachmentRequested = false;
  processingEndpoints = /* @__PURE__ */ new Set();
  processingDeliveryIds = /* @__PURE__ */ new Map();
  pendingDeliveries = /* @__PURE__ */ new Map();
  cancelledDeliveries = /* @__PURE__ */ new Set();
  reportedAttachments = /* @__PURE__ */ new Map();
  firedWebhookEvents = /* @__PURE__ */ new Set();
  // D1: reconnect state
  streamCancelled = false;
  streamSocket = null;
  streamRetryTimer = null;
  streamBackoffMs = STREAM_INITIAL_BACKOFF_MS;
  streamCursor = null;
  streamMessageChain = Promise.resolve();
  constructor(configPath, config, options = {}) {
    this.configPath = configPath;
    this.config = config;
    this.bridgeId = options.bridge_id ?? "bridge:local";
    const injectedToken = Object.prototype.hasOwnProperty.call(options, "transport_authority") ? options.transport_authority?.bearer_token ?? "" : process.env.FLOE_BRIDGE_SERVICE_TOKEN ?? "";
    this.#bridgeServiceToken = injectedToken.trim() || null;
    this.bus = new BusClient(bridgeHttpBase(config), this.#bridgeServiceToken ? { audience: "bridge_service", bearer_token: this.#bridgeServiceToken } : null);
    if (!isCredentialTransportSecure(bridgeWsBase(config))) {
      this.bus.markAuthorityUnavailable("insecure_transport");
    }
    this.adapter = chooseAdapter(configPath, config);
    const accounts = /* @__PURE__ */ new Map();
    if (this.adapter.engine && this.adapter.createEngineAccount) {
      accounts.set(this.adapter.engine, this.adapter.createEngineAccount());
    }
    this.engines = options.engines ?? new EngineControl(accounts, thisInstallation().version, (line, detail) => console.log(`[floe-bridge] ${line}`, detail ?? ""));
    this.engines.onReady((engine) => this.releaseHeldWork(engine));
  }
  get transportAuthorityState() {
    return this.bus.authorityState;
  }
  async start() {
    if (this.bus.authorityState?.status === "unavailable") {
      throw new BridgeTransportUnavailableError(this.bus.authorityState.reason);
    }
    await this.waitForBus();
    await this.bus.registerBridge({
      runtime_adapters: [this.adapter.name],
      workspace_access: this.config.bridge.workspace_access,
      capabilities: ["workspace_attach", "project_template_init", "agent_endpoint_registration", "delivery_claim"]
    });
    this.openEventStream();
    await this.attachKnownWorkspaces();
    await this.processDeliveries();
  }
  async stop() {
    this.streamCancelled = true;
    if (this.streamRetryTimer !== null) {
      clearTimeout(this.streamRetryTimer);
      this.streamRetryTimer = null;
    }
    if (this.streamSocket !== null) {
      try {
        this.streamSocket.close();
      } catch {
      }
      this.streamSocket = null;
    }
    this.firedWebhookEvents.clear();
    for (const [, stops] of this.workspaceWatchers) {
      for (const stop of stops)
        stop();
    }
    this.workspaceWatchers.clear();
    await this.engines.close();
    await this.adapter.dispose?.("bridge_shutdown");
  }
  async waitForBus() {
    const started = Date.now();
    let lastError;
    while (Date.now() - started < 3e4) {
      try {
        await this.bus.health();
        return;
      } catch (error) {
        lastError = error;
        await sleep(500);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Timed out waiting for floe-bus");
  }
  openEventStream() {
    const WebSocketCtor = globalThis.WebSocket;
    if (!WebSocketCtor)
      return;
    const connect = () => {
      if (this.streamCancelled)
        return;
      const url = `${bridgeWsBase(this.config).replace(/\/$/, "")}/v1/events/stream`;
      let socket = null;
      try {
        socket = new WebSocketCtor(url);
      } catch {
        this.scheduleStreamRetry(connect);
        return;
      }
      this.streamSocket = socket;
      let connectionAuthenticated = false;
      let connectionFailed = false;
      socket.addEventListener("open", () => {
        if (this.streamCancelled) {
          try {
            socket?.close();
          } catch {
          }
          return;
        }
        connectionAuthenticated = false;
        try {
          socket?.send(this.streamAuthenticationFrame());
        } catch (error) {
          if (error instanceof BridgeTransportUnavailableError) {
            try {
              socket?.close(4401, "bridge authority unavailable");
            } catch {
            }
            return;
          }
          try {
            socket?.close();
          } catch {
          }
        }
      });
      socket.addEventListener("message", (event) => {
        this.streamMessageChain = this.streamMessageChain.then(async () => {
          if (this.streamCancelled || connectionFailed)
            return;
          const message = JSON.parse(String(event.data));
          if (!connectionAuthenticated) {
            if (message?.type !== "authenticated" || message?.payload?.audience !== "bridge_service" || message?.payload?.bridge_id !== this.bridgeId) {
              this.bus.markAuthorityUnavailable("credential_not_accepted");
              try {
                socket?.close(4401, "bridge authority unavailable");
              } catch {
              }
              return;
            }
            connectionAuthenticated = true;
            this.streamBackoffMs = STREAM_INITIAL_BACKOFF_MS;
            return;
          }
          if (message?.type === "caught_up") {
            if (typeof message?.payload?.cursor === "string") {
              this.streamCursor = message.payload.cursor;
            }
            await this.attachKnownWorkspaces();
            await this.processDeliveries();
            return;
          }
          if (message?.type === "cursor_acknowledged")
            return;
          await this.handleEventStreamMessage(message);
          if (typeof message?.cursor === "string" && connectionAuthenticated && this.streamSocket === socket) {
            socket?.send(JSON.stringify({ type: "acknowledge_cursor", cursor: message.cursor }));
            this.streamCursor = message.cursor;
          }
        }).catch((error) => {
          console.error("[bridge] event stream frame failed", {
            error: error instanceof Error ? error.message : String(error)
          });
          connectionFailed = true;
          connectionAuthenticated = false;
          try {
            socket?.close(1011, "bridge frame handling failed");
          } catch {
          }
        });
      });
      socket.addEventListener("close", (event) => {
        if (this.streamSocket === socket)
          this.streamSocket = null;
        connectionAuthenticated = false;
        if (this.streamCancelled)
          return;
        if (event?.code === 4401 || this.bus.authorityState?.status === "unavailable") {
          this.bus.markAuthorityUnavailable?.("credential_not_accepted");
          return;
        }
        this.scheduleStreamRetry(connect);
      });
      socket.addEventListener("error", () => {
      });
    };
    connect();
  }
  streamAuthenticationFrame() {
    if (!this.#bridgeServiceToken || this.bus.authorityState?.status === "unavailable") {
      const reason = this.bus.authorityState?.status === "unavailable" ? this.bus.authorityState.reason : "credential_missing";
      throw new BridgeTransportUnavailableError(reason);
    }
    return JSON.stringify({
      type: "authenticate",
      bearer_token: this.#bridgeServiceToken,
      ...this.streamCursor ? { after_cursor: this.streamCursor } : {}
    });
  }
  /** Schedule the next WS reconnect attempt with exponential back-off (D1). */
  scheduleStreamRetry(connect) {
    if (this.streamCancelled)
      return;
    const delay = this.streamBackoffMs;
    this.streamBackoffMs = Math.min(this.streamBackoffMs * 2, STREAM_MAX_BACKOFF_MS);
    this.streamRetryTimer = setTimeout(() => {
      this.streamRetryTimer = null;
      connect();
    }, delay);
  }
  async handleEventStreamMessage(message) {
    if (message.type === "delivery_cancel_requested" && message.payload?.delivery_id) {
      const deliveryId = String(message.payload.delivery_id);
      this.cancelledDeliveries.add(deliveryId);
      await this.adapter.cancelDelivery?.(deliveryId);
    }
    if (message.type === "workspace_registered" || message.type === "workspace_selected" || message.type === "workspace_attachment_requested" || message.type === "config_snapshot_requested" || message.type === "scope_graph_created" || message.type === "scope_graph_updated" || message.type === "scope_graph_deleted" || message.type === "scope_retired" || message.type === "actor_runtime_binding_changed" || message.type === "runtime_binding_updated" || message.type === "runtime_binding_cleared") {
      await this.attachKnownWorkspaces();
      await this.processDeliveries();
    }
    if (message.type === "config_apply_requested" && message.payload?.workspace_id) {
      await this.applySavedConfig(String(message.payload.workspace_id), message.payload?.config_id ? String(message.payload.config_id) : null);
    }
    if (message.type === "delivery_bundle_available") {
      const delivery = message.payload?.delivery;
      if (delivery && typeof delivery.endpoint_id === "string" && this.endpointRuntime.has(delivery.endpoint_id)) {
        this.dispatchDelivery(delivery);
      } else {
        await this.processDeliveries();
      }
    }
    if (message.type === "config_snapshot_requested" && message.payload?.workspace_id) {
      await this.returnSnapshot(String(message.payload.workspace_id));
    }
    if (message.type === "event_submitted") {
      await this.fireWebhookReceived(message.payload?.event);
    }
    if (message.type === "context_compacted" && message.payload?.context_id) {
      await this.fireContextLifecycleHook("ContextCompacted", message.payload);
    }
    if (message.type === "context_history_cleared" && message.payload?.context_id) {
      await this.fireContextLifecycleHook("ContextHistoryCleared", message.payload);
    }
    if (message.type === "participant_added" && message.payload?.context_id) {
      await this.fireContextLifecycleHook("ParticipantAdded", message.payload);
    }
    if (message.type === "participant_removed" && message.payload?.context_id) {
      await this.fireContextLifecycleHook("ParticipantRemoved", message.payload);
    }
  }
  async fireWebhookReceived(event) {
    if (!event || event.type !== "webhook_received" || event.metadata?.trigger_kind !== "webhook")
      return;
    if (event.source_endpoint_id !== null)
      return;
    if (typeof event.event_id !== "string" || !event.event_id)
      return;
    if (typeof event.workspace_id !== "string" || !event.workspace_id)
      return;
    if (typeof event.metadata?.route_id !== "string" || !event.metadata.route_id)
      return;
    if (this.firedWebhookEvents.has(event.event_id))
      return;
    const hooks = this.workspaceHooks.get(event.workspace_id);
    if (!hooks?.hasHandlers("WebhookReceived"))
      return;
    const destination = event.destination_json;
    this.firedWebhookEvents.add(event.event_id);
    this.pruneWebhookDedupe();
    await hooks.fire("WebhookReceived", {
      workspace_id: event.workspace_id,
      route_id: event.metadata.route_id,
      event_id: event.event_id,
      context_id: event.context_id ?? null,
      target_endpoint_id: destination?.kind === "endpoint" ? destination.endpoint_id : null,
      content: event.content ?? {},
      metadata: event.metadata ?? {}
    });
  }
  pruneWebhookDedupe() {
    while (this.firedWebhookEvents.size > WEBHOOK_DEDUPE_MAX_EVENTS) {
      const oldestEventId = this.firedWebhookEvents.keys().next().value;
      if (oldestEventId === void 0)
        break;
      this.firedWebhookEvents.delete(oldestEventId);
    }
  }
  /** (to every registered HookRegistry
   * for the workspace identified by `payload.workspace_id`, if present; or all
   * workspaces when the broadcast payload does not carry workspace_id).
   */
  async fireContextLifecycleHook(hook, payload) {
    const workspaceId = payload?.workspace_id;
    if (workspaceId) {
      const hooks = this.workspaceHooks.get(workspaceId);
      if (hooks) {
        try {
          await hooks.fire(hook, payload);
        } catch (err) {
          console.error(`[bridge] ${hook} hook failed`, err);
        }
      }
    } else {
      for (const [, hooks] of this.workspaceHooks) {
        try {
          await hooks.fire(hook, payload);
        } catch (err) {
          console.error(`[bridge] ${hook} hook failed`, err);
        }
      }
    }
  }
  async attachKnownWorkspaces() {
    this.attachmentRequested = true;
    if (this.attachmentPass)
      return this.attachmentPass;
    const pass = (async () => {
      do {
        this.attachmentRequested = false;
        const workspaces = await this.bus.listWorkspaces();
        const currentWorkspaceIds = new Set(workspaces.map((workspace) => workspace.workspace_id));
        for (const workspaceId of this.workspaceLocators.keys()) {
          if (!currentWorkspaceIds.has(workspaceId))
            this.workspaceLocators.delete(workspaceId);
        }
        for (const workspace of workspaces) {
          await this.attachWorkspace(workspace);
        }
      } while (this.attachmentRequested && !this.streamCancelled);
    })();
    this.attachmentPass = pass;
    try {
      await pass;
    } finally {
      if (this.attachmentPass === pass)
        this.attachmentPass = null;
    }
  }
  async importProjectConfiguration(workspaceId, bindingId, project) {
    const observedEntries = await Promise.all(project.agents.map(async (agent) => {
      const endpointId = actorEndpointId(workspaceId, agent.agent_id);
      const runtimeConfig = extractRuntimeConfig(agent.frontmatter);
      const resolvedAuth = await this.resolveAuthProfile(workspaceId, endpointId, runtimeConfig);
      const runtimeResolvesItsOwnConfig = this.adapter.name === "fake" || this.adapter.name === "floe-runtime";
      const observation = {
        agent_id: agent.agent_id,
        adapter_id: this.adapter.name,
        backing_kind: "model",
        provider: resolvedAuth.provider ?? runtimeConfig.provider ?? null,
        model: resolvedAuth.model ?? runtimeConfig.model ?? null,
        thinking_level: resolvedAuth.thinking_level ?? runtimeConfig.thinking_level ?? null,
        credential_requirement: runtimeResolvesItsOwnConfig ? "none" : "required",
        required_configuration_keys: runtimeResolvesItsOwnConfig ? [] : ["model"],
        required_capability_ids: [],
        checkpoint_policy: { mode: "none", schema_ref: null },
        resource_policy: {}
      };
      return [agent.agent_id, {
        endpoint_id: endpointId,
        config: runtimeConfig,
        resolved_auth: resolvedAuth,
        observation
      }];
    }));
    const observedRuntimes = new Map(observedEntries.map(([agentId, observed]) => [agentId, {
      endpoint_id: observed.endpoint_id,
      config: observed.config,
      resolved_auth: observed.resolved_auth
    }]));
    const inventory = buildWorkspaceConfigurationInventory({
      binding_id: bindingId,
      project,
      runtimes: observedEntries.map(([, observed]) => observed.observation)
    });
    const importResponse = await this.bus.importWorkspaceConfiguration(workspaceId, inventory);
    return {
      inventory,
      import_response: importResponse,
      observed_runtimes: observedRuntimes
    };
  }
  async attachWorkspace(workspace) {
    if (!workspace?.workspace_id)
      return;
    this.workspaceLocators.delete(workspace.workspace_id);
    const binding = workspace?.binding;
    if (!binding?.binding_id || !binding.locator)
      return;
    if (!binding.init_authorized)
      return;
    const workspaceId = String(workspace.workspace_id);
    const bindingId = String(binding.binding_id);
    const locator = resolve5(String(binding.locator));
    if (!this.config.bridge.workspace_access.local_paths || !existsSync8(locator)) {
      await this.reportOnce(workspaceId, bindingId, "workspace_inaccessible", "workspace_locator_inaccessible", null, {
        ok: false,
        warnings: [],
        errors: [`Workspace locator is inaccessible: ${locator}`]
      });
      return;
    }
    this.workspaceLocators.set(workspaceId, locator);
    try {
      let project;
      let canonicalImport;
      let importError = null;
      try {
        ensureProjectTemplate(locator, String(workspace.name ?? "Floe Project"));
        project = loadProject(locator);
        canonicalImport = await this.importProjectConfiguration(workspaceId, bindingId, project);
      } catch (error) {
        if (error instanceof BridgeTransportUnavailableError)
          throw error;
        importError = error.message;
      }
      const importReceipt = canonicalImport?.import_response.import_result.receipt;
      const importApplied = importReceipt?.outcome === "applied";
      const runtimes = (await this.bus.listRuntimeEndpoints(workspaceId, bindingId)).filter((runtime) => runtimeAdapterMatches(runtime.adapter_id, this.adapter.name));
      for (const [endpointId, entry] of this.endpointRuntime) {
        if (entry.workspace_id === workspaceId)
          this.endpointRuntime.delete(endpointId);
      }
      for (const runtime of runtimes) {
        this.endpointRuntime.set(runtime.endpoint_id, {
          config: {},
          instructions: "",
          workspace_locator: locator,
          workspace_id: workspaceId,
          agent_id: runtime.agent_id ?? void 0
        });
        if (this.processingEndpoints.has(runtime.endpoint_id))
          continue;
        await this.bus.registerEndpoint({
          endpoint_id: runtime.endpoint_id,
          workspace_id: workspaceId,
          name: runtime.name,
          agent_id: runtime.agent_id,
          status: runtime.runtime_status === "resolved" && !this.heldForEngine.has(runtime.endpoint_id) ? "idle" : "runtime_unconfigured",
          metadata: {
            runtime_adapter: runtime.adapter_id,
            actor_definition_revision_id: runtime.actor_definition_revision_id,
            runtime_profile_revision_id: runtime.runtime_profile_revision_id,
            actor_runtime_binding_id: runtime.actor_runtime_binding_id,
            runtime_unresolved_reasons: runtime.unresolved_reasons
          }
        });
      }
      const hookRegistry = new HookRegistry();
      this.registerNodeInstructionsHook(hookRegistry);
      this.workspaceHooks.set(workspaceId, hookRegistry);
      if (!importApplied || !project) {
        const canAttach = runtimes.length > 0;
        await this.reportOnce(workspaceId, bindingId, canAttach ? "attached" : "config_invalid", canAttach ? null : importReceipt?.refusal?.code ?? "workspace_configuration_import_refused", null, {
          ok: canAttach,
          import_receipt_id: importReceipt?.import_receipt_id ?? null,
          import_refusal: importReceipt?.refusal ?? null,
          import_error: importError,
          unavailable_actors: runtimes.filter((runtime) => runtime.runtime_status !== "resolved").map((runtime) => ({ actor_id: runtime.actor_id, reasons: runtime.unresolved_reasons }))
        });
        return;
      }
      for (const pulseDef of project.pulses) {
        try {
          await this.bus.createPulse({
            pulse_id: pulseDef.id,
            workspace_id: workspace.workspace_id,
            persistence: pulseDef.persistence ?? "workspace",
            scope_id: pulseDef.scope_id,
            trigger: pulseDef.trigger,
            content: pulseDef.content,
            subscribers: pulseDef.subscribers ?? []
          });
        } catch (error) {
          console.error("[bridge] pulse registration failed", { pulse_id: pulseDef.id, error });
        }
      }
      let scopeGraphs = [];
      try {
        const { graphs } = await this.bus.listScopeGraphsForWorkspace(workspace.workspace_id);
        scopeGraphs = graphs;
        for (const graph of scopeGraphs) {
          for (const node of graph.nodes) {
            if (node.kind === "actor" && Array.isArray(node.bindings) && node.bindings.length > 0) {
              const text = node.bindings.filter((binding2) => binding2.kind === "instructions" && typeof binding2.text === "string").map((binding2) => binding2.text).join("\n\n");
              if (text)
                this.nodeInstructionBindings.set(`${node.endpoint_id}:${graph.context_id}`, text);
            }
          }
        }
      } catch (error) {
        console.error("[bridge] legacy Scope graph inspection failed", { workspace_id: workspace.workspace_id, error });
      }
      for (const stop of this.workspaceWatchers.get(workspace.workspace_id) ?? [])
        stop();
      const watcherStops = [];
      const startedWatchers = /* @__PURE__ */ new Set();
      const startWatcher = (watcherDef) => {
        const watchPath = resolve5(locator, watcherDef.path);
        const workspaceRelative = relative3(locator, watchPath);
        const watcherKey = `${watcherDef.graph_id}:${watcherDef.node_id}:${watchPath}`;
        if (workspaceRelative.startsWith("..") || isAbsolute4(workspaceRelative)) {
          console.error("[bridge] watcher path escapes workspace \u2014 skipping", { watcher_id: watcherDef.id, path: watchPath });
          return;
        }
        if (!existsSync8(watchPath) || startedWatchers.has(watcherKey)) {
          if (!existsSync8(watchPath)) {
            console.error("[bridge] watcher path does not exist \u2014 skipping", { watcher_id: watcherDef.id, path: watchPath });
          }
          return;
        }
        startedWatchers.add(watcherKey);
        const stop = watchFolder(watchPath, (arrival) => {
          this.bus.fireScopeGraphTriggerNode(workspace.workspace_id, watcherDef.graph_id, watcherDef.node_id, {
            content: {
              file_name: arrival.file_name,
              file_path: arrival.file_path,
              channel: "watched_folder",
              locator: arrival.file_path,
              observed_at: arrival.observed_at,
              raw_reference: arrival.file_path,
              arrival_id: arrival.arrival_id
            },
            idempotency_key: `folder-arrival:${watcherDef.graph_id}:${watcherDef.node_id}:${arrival.arrival_id}`
          }).catch((error) => {
            console.error("[bridge] watcher trigger fire failed", { watcher_id: watcherDef.id, error });
          });
        }, {
          extensions: watcherDef.extensions,
          settle_ms: watcherDef.settle_ms
        });
        watcherStops.push(stop);
      };
      for (const watcherDef of project.watchers)
        startWatcher(watcherDef);
      for (const graph of scopeGraphs) {
        for (const node of graph.nodes) {
          if (node.kind !== "trigger" || node.source?.kind !== "folder" || typeof node.source.path !== "string") {
            continue;
          }
          startWatcher({
            id: `${graph.graph_id}:${node.node_id}`,
            graph_id: graph.graph_id,
            node_id: node.node_id,
            path: node.source.path,
            extensions: node.source.extensions,
            settle_ms: node.source.settle_ms
          });
        }
      }
      this.workspaceWatchers.set(workspace.workspace_id, watcherStops);
      await this.reportOnce(workspaceId, bindingId, "attached", null, importReceipt.config_hash, {
        ...canonicalImport.inventory.validation,
        import_receipt_id: importReceipt.import_receipt_id,
        unavailable_actors: runtimes.filter((actor) => actor.runtime_status !== "resolved").map((actor) => ({
          actor_id: actor.actor_id,
          reasons: actor.unresolved_reasons
        }))
      });
    } catch (error) {
      await this.reportOnce(workspaceId, bindingId, "attach_failed", "bridge_attach_failed", null, {
        ok: false,
        warnings: [],
        errors: [error.message]
      });
    }
  }
  async reportOnce(workspaceId, bindingId, status, errorCode2, configHash, validation) {
    const key = JSON.stringify({ bindingId, status, errorCode: errorCode2, configHash, validation });
    if (this.reportedAttachments.get(workspaceId) === key)
      return;
    await this.bus.reportAttachment(workspaceId, {
      binding_id: bindingId,
      status,
      config_hash: configHash,
      error_code: errorCode2,
      validation
    });
    this.reportedAttachments.set(workspaceId, key);
  }
  async returnSnapshot(workspaceId) {
    const workspaces = await this.bus.listWorkspaces();
    const workspace = workspaces.find((item) => item.workspace_id === workspaceId);
    if (!workspace)
      return;
    const binding = workspace.binding;
    if (!binding?.binding_id || !binding.locator)
      return;
    const bindingId = String(binding.binding_id);
    const locator = resolve5(String(binding.locator));
    if (!existsSync8(locator))
      return;
    const project = loadProject(locator);
    await this.importProjectConfiguration(workspaceId, bindingId, project);
  }
  async applySavedConfig(workspaceId, configId) {
    const workspaces = await this.bus.listWorkspaces();
    const workspace = workspaces.find((item) => item.workspace_id === workspaceId);
    if (!workspace)
      return;
    const binding = workspace.binding;
    if (!binding?.binding_id || !binding.locator)
      return;
    const bindingId = String(binding.binding_id);
    const locator = resolve5(String(binding.locator));
    if (!existsSync8(locator)) {
      await this.reportOnce(workspaceId, bindingId, "workspace_inaccessible", "workspace_locator_inaccessible", null, {
        ok: false,
        warnings: [],
        errors: [`Workspace locator is inaccessible: ${locator}`]
      });
      return;
    }
    const configs = await this.bus.listConfigs();
    const record = configs.find((item) => item.config_id === configId);
    if (!record) {
      await this.reportOnce(workspaceId, bindingId, "config_apply_failed", "saved_config_not_found", null, {
        ok: false,
        warnings: [],
        errors: [`Saved config not found: ${configId ?? "(none)"}`]
      });
      return;
    }
    const configJson = typeof record.config_json === "string" ? JSON.parse(record.config_json) : record.config_json;
    materializeSavedConfig(locator, configJson);
    this.reportedAttachments.delete(workspaceId);
    await this.attachWorkspace(workspace);
  }
  async processDeliveries() {
    try {
      const deliveries = await this.bus.claimDeliveries();
      for (const delivery of deliveries) {
        this.dispatchDelivery(delivery);
      }
    } catch (error) {
      console.error("[bridge] delivery processing failed", error);
      throw error;
    }
  }
  dispatchDelivery(delivery) {
    if (this.processingEndpoints.has(delivery.endpoint_id)) {
      if (this.processingDeliveryIds.get(delivery.endpoint_id) === delivery.delivery_id)
        return;
      let pending = this.pendingDeliveries.get(delivery.endpoint_id);
      if (!pending)
        this.pendingDeliveries.set(delivery.endpoint_id, pending = /* @__PURE__ */ new Map());
      pending.set(delivery.delivery_id, delivery);
      return;
    }
    this.processingEndpoints.add(delivery.endpoint_id);
    this.processingDeliveryIds.set(delivery.endpoint_id, delivery.delivery_id);
    void (async () => {
      try {
        await this.handleDelivery(delivery);
      } catch (error) {
        console.error("[bridge] delivery handling escaped", {
          delivery_id: delivery.delivery_id,
          endpoint_id: delivery.endpoint_id,
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        this.processingEndpoints.delete(delivery.endpoint_id);
        this.processingDeliveryIds.delete(delivery.endpoint_id);
        const pending = this.pendingDeliveries.get(delivery.endpoint_id);
        const next = pending?.values().next().value;
        if (next)
          pending.delete(next.delivery_id);
        if (!pending?.size)
          this.pendingDeliveries.delete(delivery.endpoint_id);
        if (next)
          this.dispatchDelivery(next);
      }
    })();
  }
  async handleDelivery(delivery) {
    if (this.cancelledDeliveries.delete(delivery.delivery_id)) {
      console.log("[bridge] cancelled delivery skipped before execution", {
        delivery_id: delivery.delivery_id,
        endpoint_id: delivery.endpoint_id
      });
      await this.reportTurnEndSafely(delivery.endpoint_id);
      return;
    }
    if (this.adapter.engine && !await this.engineAdmits(delivery, this.adapter.engine))
      return;
    console.log("[bridge] delivery claimed", {
      delivery_id: delivery.delivery_id,
      endpoint_id: delivery.endpoint_id,
      workspace_id: delivery.workspace_id,
      event_count: delivery.events.length
    });
    try {
      const endpointEntry = this.endpointRuntime.get(delivery.endpoint_id);
      const runtimeConfig = endpointEntry?.config;
      const instructions = endpointEntry?.instructions;
      let preparedAttemptId = null;
      let operationAuthoritySession;
      let effectiveRuntime;
      const hasCanonicalRuntimePins = Boolean(delivery.processing_contract || delivery.node_execution_id || delivery.actor_definition_revision_id && delivery.runtime_profile_revision_id && delivery.actor_runtime_binding_id);
      if (hasCanonicalRuntimePins) {
        const prepared = await this.bus.prepareRuntimeDelivery(delivery.delivery_id);
        const contract = prepared.processing_contract;
        const contractMatchesDelivery = contract.contract_kind === "direct_context" ? contract.delivery.delivery_id === delivery.delivery_id && contract.delivery.endpoint_id === delivery.endpoint_id : contract.node_execution.node_execution_id === delivery.node_execution_id;
        if (!contractMatchesDelivery || contract.workspace_id !== delivery.workspace_id) {
          throw new RuntimeAuthError("runtime_processing_contract_mismatch", "The prepared runtime processing contract does not belong to this Delivery.");
        }
        const pinned = selectPinnedRuntime(contract);
        if (!runtimeAdapterMatches(pinned.adapter_id, this.adapter.name)) {
          throw new RuntimeAuthError("runtime_profile_provider_mismatch", `The pinned runtime profile requires adapter '${pinned.adapter_id}', but this Bridge runs '${this.adapter.name}'.`);
        }
        delivery.processing_contract = contract;
        operationAuthoritySession = prepared.operation_authority_session;
        if (contract.contract_kind === "scope_node") {
          preparedAttemptId = contract.execution_attempt.attempt_id;
          delivery.execution_attempt_id = preparedAttemptId;
        }
        effectiveRuntime = pinned.config;
      } else {
        const placementInstructions = delivery.node_contract?.node.kind === "actor" ? (delivery.node_contract.node.bindings ?? []).filter((binding) => binding.kind === "instructions" && binding.text.trim().length > 0).map((binding) => binding.text.trim()).join("\n\n") : "";
        const resolvedAuth = await this.resolveAuthProfile(delivery.workspace_id, delivery.endpoint_id, runtimeConfig);
        effectiveRuntime = {
          ...runtimeConfig,
          provider: resolvedAuth.provider ?? runtimeConfig?.provider ?? void 0,
          auth_profile: resolvedAuth.auth_profile ?? void 0,
          auth_profile_source: resolvedAuth.source ?? void 0,
          model: resolvedAuth.model ?? runtimeConfig?.model ?? void 0,
          model_source: resolvedAuth.model_source ?? void 0,
          thinking_level: resolvedAuth.thinking_level ?? runtimeConfig?.thinking_level ?? void 0,
          instructions: [instructions?.trim(), placementInstructions].filter((value) => Boolean(value)).join("\n\n") || void 0
        };
      }
      console.log("[bridge] effective runtime resolved", {
        delivery_id: delivery.delivery_id,
        provider: effectiveRuntime.provider ?? "(none)",
        model: effectiveRuntime.model ?? "(none)",
        model_source: effectiveRuntime.model_source ?? "(none)",
        auth_profile: effectiveRuntime.auth_profile ?? "(none)",
        auth_profile_source: effectiveRuntime.auth_profile_source ?? "(none)",
        instructions_bytes: effectiveRuntime.instructions?.length ?? 0
      });
      const injected = await this.bus.reportDeliveryStatus(delivery.delivery_id, "injected_to_runtime");
      delivery.execution_attempt_id = injected?.execution_attempt_id ?? delivery.execution_attempt_id ?? null;
      if (preparedAttemptId && delivery.execution_attempt_id !== preparedAttemptId) {
        throw new Error(`The Bus changed ExecutionAttempt from '${preparedAttemptId}' to '${delivery.execution_attempt_id ?? "none"}' before runtime injection.`);
      }
      console.log("[bridge] delivery injected to runtime", { delivery_id: delivery.delivery_id, adapter: this.adapter.name });
      const hookRegistry = this.workspaceHooks.get(delivery.workspace_id);
      await this.adapter.handleBundle({
        bridge_id: this.bridgeId,
        bus: this.bus,
        workspace_locator: this.workspaceLocators.get(delivery.workspace_id),
        agent_id: endpointEntry?.agent_id,
        hooks: hookRegistry,
        operation_authority_session: operationAuthoritySession
      }, delivery, effectiveRuntime);
      if (this.cancelledDeliveries.delete(delivery.delivery_id)) {
        await this.reportTurnEndSafely(delivery.endpoint_id);
        return;
      }
      await this.bus.reportDeliveryStatus(delivery.delivery_id, "acknowledged");
      console.log("[bridge] delivery acknowledged", { delivery_id: delivery.delivery_id });
      await this.reportTurnEndSafely(delivery.endpoint_id);
    } catch (error) {
      console.error("[bridge] adapter failed", error);
      if (this.cancelledDeliveries.delete(delivery.delivery_id)) {
        console.log("[bridge] cancelled delivery stopped", { delivery_id: delivery.delivery_id });
        await this.reportTurnEndSafely(delivery.endpoint_id);
        return;
      }
      const deferCodes = [
        "runtime_profile_required",
        "provider_auth_missing",
        "runtime_profile_provider_mismatch",
        "runtime_provider_required",
        "runtime_model_required",
        "runtime_model_unknown",
        "runtime_credential_unresolved"
      ];
      if (error instanceof RuntimeAuthError && deferCodes.includes(error.code)) {
        console.log("[bridge] delivery deferred", { delivery_id: delivery.delivery_id, code: error.code });
        await this.bus.appendRuntimeTelemetry({
          workspace_id: delivery.workspace_id,
          endpoint_id: delivery.endpoint_id,
          delivery_id: delivery.delivery_id,
          kind: error.code,
          payload: {
            code: error.code,
            message: error.message
          }
        });
        await this.bus.reportDeliveryStatus(delivery.delivery_id, "deferred", `${error.code}: ${error.message}`);
        return;
      }
      if (error instanceof TurnFailedError) {
        if (this.adapter.engine)
          void this.engines.recheck(this.adapter.engine);
        console.log("[bridge] turn failed", {
          delivery_id: error.delivery_id,
          source_endpoint_id: error.source_endpoint_id,
          model: error.model_id,
          http_status: error.http_status
        });
        const errorSummary = `Runtime turn failed for model '${error.model_id}' (provider: ${error.provider})` + (error.http_status ? `, HTTP ${error.http_status}` : "") + `: ${error.message}`;
        await this.bus.reportDeliveryStatus(delivery.delivery_id, "dead_lettered", error.message);
        try {
          await this.bus.recordRuntimeTurnResult({
            delivery_id: delivery.delivery_id,
            outcome: "failed",
            text: errorSummary,
            metadata: {
              runtime: this.adapter.name,
              origin: "turn_failed",
              model: error.model_id,
              provider: error.provider,
              http_status: error.http_status,
              safe_to_retry_automatically: false
            }
          });
        } catch (recordErr) {
          console.error("[bridge] failed to record terminal turn failure", recordErr);
        }
        await this.reportTurnEndSafely(delivery.endpoint_id);
        return;
      }
      console.log("[bridge] delivery failed", {
        delivery_id: delivery.delivery_id,
        error: error.message
      });
      const message = error instanceof Error ? error.message : String(error);
      await this.bus.reportDeliveryStatus(delivery.delivery_id, "dead_lettered", message);
      try {
        await this.bus.recordRuntimeTurnResult({
          delivery_id: delivery.delivery_id,
          outcome: "failed",
          text: `Runtime turn stopped before it could report a durable completion: ${message}`,
          metadata: {
            origin: "runtime_error",
            safe_to_retry_automatically: false
          }
        });
      } catch (recordErr) {
        console.error("[bridge] failed to record terminal runtime error", recordErr);
      }
      await this.reportTurnEndSafely(delivery.endpoint_id);
    }
  }
  /**
   * Registers the BeforeTurn handler that injects an actor node's own
   * instructions binding — node-specific material, distinct from the actor's
   * general `.floe/agents/*.md` instructions — using the exact inject-once
   * mechanism extension overlays already use (dedup happens in the adapter's
   * InjectionBaseline, keyed by context_id + this result's `source`). Keying
   * `source` by endpoint_id keeps each actor node's baseline independent
   * within a shared graph Context, so alternating actors don't stomp on each
   * other's dedup state.
   */
  registerNodeInstructionsHook(hookRegistry) {
    hookRegistry.on("BeforeTurn", "_substrate_node_bindings", (payload) => {
      if (payload.origin?.kind !== "context")
        return;
      const text = this.nodeInstructionBindings.get(`${payload.endpoint_id}:${payload.origin.id}`);
      if (!text)
        return;
      return { inject: { source: `node_instructions:${payload.endpoint_id}`, content: text } };
    });
  }
  async reportTurnEndSafely(endpointId) {
    try {
      await this.bus.reportTurnEnd(endpointId);
      console.log("[bridge] turn end reported", { endpoint_id: endpointId });
    } catch (error) {
      console.error("[bridge] turn end report failed", {
        endpoint_id: endpointId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  async updateEndpointStatusSafely(endpointId, status) {
    try {
      await this.bus.updateEndpointStatus(endpointId, status);
    } catch (error) {
      console.error("[bridge] endpoint status report failed", {
        endpoint_id: endpointId,
        status,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  /**
   * Work runs only on a ready engine. Otherwise the delivery is handed back to
   * the Bus unstarted: its events stay queued, durably, and the Actor stays
   * paused until the engine becomes ready (releaseHeldWork) or the Bridge
   * restarts and re-registers it.
   */
  async engineAdmits(delivery, engine) {
    let state;
    try {
      state = await this.engines.gate(engine);
    } catch (error) {
      state = {
        engine,
        phase: "unavailable",
        authentication: "unknown",
        access: "unknown",
        reachability: "unknown",
        action: "retry",
        revision: 0,
        checked_at: (/* @__PURE__ */ new Date()).toISOString(),
        message: error instanceof Error ? error.message : String(error)
      };
    }
    if (state.phase === "ready")
      return true;
    this.heldForEngine.set(delivery.endpoint_id, engine);
    console.log("[bridge] delivery held until engine is ready", {
      delivery_id: delivery.delivery_id,
      endpoint_id: delivery.endpoint_id,
      engine,
      phase: state.phase
    });
    try {
      await this.bus.appendRuntimeTelemetry({
        workspace_id: delivery.workspace_id,
        endpoint_id: delivery.endpoint_id,
        delivery_id: delivery.delivery_id,
        kind: "engine_not_ready",
        payload: { code: "engine_not_ready", engine, phase: state.phase, action: state.action, message: state.message }
      });
      await this.bus.reportDeliveryStatus(delivery.delivery_id, "deferred", `engine_not_ready: ${state.message}`);
    } catch (error) {
      console.error("[bridge] engine hold report failed", {
        delivery_id: delivery.delivery_id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    if (this.engines.state().engines[engine]?.phase === "ready")
      this.releaseHeldWork(engine);
    return false;
  }
  releaseHeldWork(engine) {
    for (const [endpointId, heldEngine] of this.heldForEngine) {
      if (heldEngine !== engine)
        continue;
      this.heldForEngine.delete(endpointId);
      console.log("[bridge] engine ready; releasing held work", { endpoint_id: endpointId, engine });
      void this.updateEndpointStatusSafely(endpointId, "idle");
    }
  }
  async resolveAuthProfile(workspaceId, endpointId, runtimeConfig) {
    const bindings = await this.bus.resolveRuntimeBinding(workspaceId, endpointId);
    if (bindings.endpoint_auth_profile) {
      return {
        auth_profile: bindings.endpoint_auth_profile,
        provider: bindings.endpoint_provider ?? bindings.workspace_provider ?? bindings.global_provider ?? null,
        model: bindings.endpoint_model ?? bindings.workspace_model ?? bindings.global_model ?? null,
        source: "agent_binding",
        model_source: bindings.endpoint_model ? "agent_binding" : bindings.workspace_model ? "workspace_binding" : bindings.global_model ? "global_binding" : null,
        thinking_level: bindings.endpoint_thinking_level ?? bindings.workspace_thinking_level ?? bindings.global_thinking_level ?? null
      };
    }
    if (bindings.workspace_auth_profile) {
      return {
        auth_profile: bindings.workspace_auth_profile,
        provider: bindings.workspace_provider ?? bindings.global_provider ?? null,
        model: bindings.workspace_model ?? bindings.global_model ?? null,
        source: "workspace_binding",
        model_source: bindings.workspace_model ? "workspace_binding" : bindings.global_model ? "global_binding" : null,
        thinking_level: bindings.workspace_thinking_level ?? bindings.global_thinking_level ?? null
      };
    }
    if (runtimeConfig?.auth_profile?.trim()) {
      return {
        auth_profile: runtimeConfig.auth_profile.trim(),
        provider: runtimeConfig.provider?.trim() || null,
        model: null,
        source: "project_runtime",
        model_source: null,
        thinking_level: bindings.global_thinking_level ?? null
      };
    }
    if (bindings.global_auth_profile) {
      return {
        auth_profile: bindings.global_auth_profile,
        provider: bindings.global_provider ?? null,
        model: bindings.global_model ?? null,
        source: "runtime_binding_global",
        model_source: bindings.global_model ? "global_binding" : null,
        thinking_level: bindings.global_thinking_level ?? null
      };
    }
    if (this.config.runtime?.default_auth_profile?.trim()) {
      return {
        auth_profile: this.config.runtime.default_auth_profile.trim(),
        provider: runtimeConfig?.provider?.trim() || null,
        model: null,
        source: "config_global_default",
        model_source: null,
        thinking_level: bindings.global_thinking_level ?? null
      };
    }
    return {
      auth_profile: null,
      provider: runtimeConfig?.provider?.trim() || null,
      model: null,
      source: null,
      model_source: null,
      thinking_level: bindings.global_thinking_level ?? null
    };
  }
};
function chooseAdapter(_configPath, config) {
  const configured = config.bridge.runtime_adapter;
  if (!configured)
    return new FloeRuntimeAdapter();
  const selected = configured.trim().toLowerCase();
  if (selected === "fake")
    return new FakeRuntimeAdapter();
  if (selected === "floe-runtime")
    return new FloeRuntimeAdapter();
  throw new Error(`Unsupported bridge.runtime_adapter "${selected}" in the Floe config. Use "fake" or "floe-runtime".`);
}
function runtimeAdapterMatches(requiredAdapterId, activeAdapterName) {
  const required = requiredAdapterId.trim().toLowerCase();
  const active = activeAdapterName.trim().toLowerCase();
  if (required === active)
    return true;
  if (active === "pi-agent-core" && ["pi"].includes(required))
    return true;
  return false;
}
function actorEndpointId(workspaceId, agentId) {
  return `actor:${workspaceId}:${agentId}`;
}
function sleep(ms) {
  return new Promise((resolve6) => setTimeout(resolve6, ms));
}
function extractRuntimeConfig(frontmatter) {
  const runtime = frontmatter.runtime ?? {};
  return {
    provider: typeof runtime.provider === "string" ? runtime.provider : void 0,
    model: typeof runtime.model === "string" ? runtime.model : void 0,
    auth_profile: typeof runtime.auth_profile === "string" ? runtime.auth_profile : void 0
  };
}

// floe-bridge/dist/index.js
function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0)
    return process.argv[index + 1];
  const match = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : void 0;
}
async function main() {
  const command = process.argv[2] ?? "daemon";
  if (command !== "daemon") {
    console.error(`Unknown floe-bridge command: ${command}`);
    process.exit(1);
  }
  const { configPath, config } = ensureConfig(getArgValue("--config"));
  const daemon = new BridgeDaemon(configPath, config);
  const engineChannel = await serveChannel(ENGINES_CHANNEL, daemon.engines, {
    home: canonicalHome(resolveLocalPath(configPath, config.home, ".")),
    log: (line) => console.log(`[floe-bridge] engine control ${line}`)
  });
  daemon.engines.start();
  const stop = () => void daemon.stop().finally(() => engineChannel.close()).finally(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  await daemon.start();
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
