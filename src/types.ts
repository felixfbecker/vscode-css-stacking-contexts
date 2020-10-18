import { Rule, AtRule, Declaration, Node } from 'postcss'

export const isRule = (node: Node): node is Rule => node.type === 'rule'
export const isAtRule = (node: Node): node is AtRule => node.type === 'atrule'
export const isDeclaration = (node: Node): node is Declaration => node.type === 'decl'
export const isRuleLike = (node?: Node): node is Rule | AtRule => !!node && (isRule(node) || isAtRule(node))
