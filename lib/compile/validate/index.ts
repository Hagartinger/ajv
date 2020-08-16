import {CompilationContext} from "../../types"
import {schemaUnknownRules, schemaHasRules, schemaHasRulesExcept} from "../util"
import {quotedString} from "../../vocabularies/util"
import {booleanOrEmptySchema} from "./boolSchema"
import {getSchemaTypes, coerceAndCheckDataType} from "./dataType"
import {schemaKeywords} from "./keywords"

const resolve = require("../resolve")

export default function validateCode(it: CompilationContext): string {
  const {
    isTop,
    schema,
    RULES,
    level,
    gen,
    opts: {$comment},
  } = it
  // TODO _out
  gen._out = ""
  checkUnknownKeywords(it)
  if (isTop) startFunction(it)
  if (typeof schema == "boolean" || !schemaHasRules(schema, RULES.all)) {
    booleanOrEmptySchema(it)
    // TODO _out
    return gen._out
  }
  if (isTop) {
    updateTopContext(it)
    checkNoDefault(it)
    initializeTop(it)
  } else {
    updateContext(it)
    checkAsync(it)
    gen.code(`var errs_${level} = errors;`)
  }
  checkRefsAndKeywords(it)
  if ($comment && schema.$comment) commentKeyword(it)
  const types = getSchemaTypes(it)
  const checkedTypes = coerceAndCheckDataType(it, types)
  schemaKeywords(it, types, !checkedTypes, isTop)
  if (isTop) endFunction(it)
  else gen.code(`var valid${level} = errors === errs_${level};`)
  // TODO _out
  return gen._out
}

export function checkUnknownKeywords({
  schema,
  RULES,
  opts: {strictKeywords},
  logger,
}: CompilationContext): void {
  if (strictKeywords) {
    const unknownKeyword = schemaUnknownRules(schema, RULES.keywords)
    if (unknownKeyword) {
      const msg = `unknown keyword: "${unknownKeyword}"`
      if (strictKeywords === "log") logger.warn(msg)
      else throw new Error(msg)
    }
  }
}

export function startFunction({
  gen,
  schema,
  async,
  opts: {sourceCode, processCode},
}: CompilationContext): void {
  const asyncFunc = async ? "async" : ""
  const sourceUrl =
    schema.$id && (sourceCode || processCode) ? `/*# sourceURL=${schema.$id} */` : ""
  gen.code(
    `const validate = ${asyncFunc} function(data, dataPath, parentData, parentDataProperty, rootData) {
      'use strict';
      ${sourceUrl}`
  )
}

export function updateTopContext(it: CompilationContext): void {
  it.rootId = resolve.fullPath(it.root.schema.$id)
  it.baseId = it.baseId || it.rootId
  delete it.isTop

  it.dataPathArr = [""]
}

export function checkNoDefault({
  schema,
  opts: {useDefaults, strictDefaults},
  logger,
}: CompilationContext): void {
  if (schema.default !== undefined && useDefaults && strictDefaults) {
    const msg = "default is ignored in the schema root"
    if (strictDefaults === "log") logger.warn(msg)
    else throw new Error(msg)
  }
}

export function initializeTop({gen}: CompilationContext): void {
  // TODO old comment: "don't edit, used in replace". Should be removed?
  gen.code(
    `let vErrors = null;
    let errors = 0;
    if (rootData === undefined) rootData = data;`
  )
}

export function updateContext(it: CompilationContext): void {
  if (it.schema.$id) it.baseId = resolve.url(it.baseId, it.schema.$id)
}

export function checkAsync(it: CompilationContext): void {
  if (it.schema.$async && !it.async) throw new Error("async schema in sync schema")
}

export function checkRefsAndKeywords({
  schema,
  errSchemaPath,
  RULES,
  opts: {extendRefs},
  logger,
}: CompilationContext): void {
  if (schema.$ref && schemaHasRulesExcept(schema, RULES.all, "$ref")) {
    if (extendRefs === "fail") {
      throw new Error(`$ref: sibling validation keywords at "${errSchemaPath}" (option extendRefs)`)
    } else if (extendRefs !== true) {
      logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`)
    }
  }
}

export function commentKeyword({
  gen,
  schema,
  errSchemaPath,
  opts: {$comment},
}: CompilationContext): void {
  const msg = quotedString(schema.$comment)
  if ($comment === true) {
    gen.code(`console.log(${msg})`)
  } else if (typeof $comment == "function") {
    const schemaPath = quotedString(errSchemaPath + "/$comment")
    gen.code(`self._opts.$comment(${msg}, ${schemaPath}, validate.root.schema)`)
  }
}

export function endFunction({gen, async}: CompilationContext) {
  // TODO old comment: "don't edit, used in replace". Should be removed?
  gen.code(
    async
      ? `if (errors === 0) return data;
        else throw new ValidationError(vErrors);`
      : `validate.errors = vErrors;
        return errors === 0;`
  )
  gen.code(
    `};
    return validate;`
  )
}
