import { Node, Position } from 'postcss'
import * as vscode from 'vscode'

export const convertPosition = (position: Position): vscode.Position =>
    new vscode.Position(position.line - 1, position.column - 1)

export const nodeRange = (node: Node): vscode.Range => {
    if (!node.source?.start || !node.source.end) {
        throw new Error('Node has no source position')
    }
    return new vscode.Range(convertPosition(node.source.start), convertPosition(node.source.end))
}

export const eol = (textDocument: vscode.TextDocument): string =>
    textDocument.eol === vscode.EndOfLine.LF ? '\n' : '\r\n'
