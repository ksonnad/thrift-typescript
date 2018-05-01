import * as ts from 'typescript'

import {
    FieldDefinition,
    ExceptionDefinition,
} from '@creditkarma/thrift-parser'

import {
    COMMON_IDENTIFIERS,
} from '../identifiers'

import {
    createConstStatement,
    propertyAccessForIdentifier,
    createEqualsCheck,
    hasRequiredField,
} from '../utils'

import {
    THRIFT_IDENTIFIERS,
    THRIFT_TYPES,
} from '../identifiers'

import {
    createInputParameter,
    readFieldBegin,
    readFieldEnd,
    readStructBegin,
    readStructEnd,
    createSkipBlock,
    createCaseForField,
    createCheckForFields,
    createTempVariables,
} from '../struct/decode'

import {
    throwProtocolException,
} from '../utils'

import {
    IIdentifierMap
} from '../../../types'

import {
    getInitializerForField,
} from '../utils'

import {
    createNumberType,
} from '../types'
import { strictNameForStruct } from '../struct/utils';

export function createDecodeMethod(node: ExceptionDefinition, identifiers: IIdentifierMap): ts.MethodDeclaration {
    const inputParameter: ts.ParameterDeclaration = createInputParameter()
    const tempVariables: Array<ts.VariableStatement> = createTempVariables(node)

    /**
     * cosnt ret: { fieldName: string; fieldType: Thrift.Type; fieldId: number; } = input.readFieldBegin()
     * const fieldType: Thrift.Type = ret.fieldType
     * const fieldId: number = ret.fieldId
     */
    const ret: ts.VariableStatement = createConstStatement(
        'ret',
        ts.createTypeReferenceNode(
            THRIFT_IDENTIFIERS.IThriftField,
            undefined
        ),
        readFieldBegin()
    )

    const fieldType: ts.VariableStatement = createConstStatement(
        'fieldType',
        ts.createTypeReferenceNode(THRIFT_IDENTIFIERS.Thrift_Type, undefined),
        propertyAccessForIdentifier('ret', 'fieldType')
    )

    const fieldId: ts.VariableStatement = createConstStatement(
        'fieldId',
        createNumberType(),
        propertyAccessForIdentifier('ret', 'fieldId')
    )

    /**
     * if (fieldType === Thrift.Type.STOP) {
     *     break;
     * }
     */
    const checkStop: ts.IfStatement = ts.createIf(
        createEqualsCheck(
            COMMON_IDENTIFIERS.fieldType,
            THRIFT_TYPES.STOP
        ),
        ts.createBlock([
            ts.createBreak()
        ], true)
    )

    const whileLoop: ts.WhileStatement = ts.createWhile(
        ts.createLiteral(true),
        ts.createBlock([
            ret,
            fieldType,
            fieldId,
            checkStop,
            ts.createSwitch(
                COMMON_IDENTIFIERS.fieldId, // what to switch on
                ts.createCaseBlock([
                    ...node.fields.map((next: FieldDefinition) => {
                        return createCaseForField(next, identifiers)
                    }),
                    ts.createDefaultClause([
                        createSkipBlock()
                    ])
                ])
            ),
            readFieldEnd(),
        ], true)
    )

    return ts.createMethod(
        undefined,
        undefined,
        undefined,
        ts.createIdentifier('decode'),
        undefined,
        undefined,
        [ inputParameter ],
        ts.createTypeReferenceNode(
            ts.createIdentifier(strictNameForStruct(node)),
            undefined,
        ), // return type
        ts.createBlock([
            ...tempVariables,
            readStructBegin(),
            whileLoop,
            readStructEnd(),
            createReturnForException(node),
        ], true),
    )
}

export function createReturnForException(node: ExceptionDefinition): ts.Statement {
    if (hasRequiredField(node)) {
        return ts.createIf(
            createCheckForFields(node.fields),
            ts.createBlock([
                createReturnValue(node),
            ], true),
            ts.createBlock([
                throwProtocolException(
                    'UNKNOWN',
                    `Unable to read ${node.name.value} from input`
                )
            ], true)
        )
    } else {
        return createReturnValue(node)
    }
}

function createReturnValue(node: ExceptionDefinition): ts.ReturnStatement {
    return ts.createReturn(
        ts.createNew(
            ts.createIdentifier(strictNameForStruct(node)),
            undefined,
            [ ts.createObjectLiteral(
                node.fields.map((next: FieldDefinition): ts.ObjectLiteralElementLike => {
                    return ts.createPropertyAssignment(
                        next.name.value,
                        getInitializerForField('_args', next),
                    )
                }),
                true // multiline
            ) ]
        )
    )
}
