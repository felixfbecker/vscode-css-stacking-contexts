import { Declaration } from 'postcss'
import { isDeclaration, isRuleLike } from './types'

const globalNeutralValues = new Set<string>(['unset', 'initial', 'inherit', 'revert'])
const stackingContextEstablishingProperties = new Set<string>([
    'clip-path',
    'contain',
    'filter',
    'isolation',
    'mask-border',
    'mask-image',
    'mask',
    'mix-blend-mode',
    'opacity',
    'perspective',
    'position',
    'transform',
    'webkit-overflow-scrolling',
    'z-index',
])
const flexAndGridChildProperties = new Set<string>([
    'flex',
    'flex-grow',
    'flex-shrink',
    'flex-basis',
    'grid-column-start',
    'grid-column-end',
    'grid-row-start',
    'grid-row-end',
    'grid-column',
    'grid-row',
    'align-self',
    'justify-self',
    'place-self',
    'order',
])

// https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Positioning/Understanding_z_index/The_stacking_context
export function establishesStackingContext(declaration: Declaration): boolean {
    return (
        stackingContextEstablishingProperties.has(declaration.prop) &&
        !globalNeutralValues.has(declaration.value) &&
        ((declaration.prop === 'z-index' &&
            declaration.value !== 'auto' &&
            isRuleLike(declaration.parent) &&
            declaration.parent.some(
                child =>
                    isDeclaration(child) &&
                    ((child.prop === 'position' && (child.value === 'absolute' || child.value === 'relative')) ||
                        // If the rule has any flex/grid child properties, it is likely the child of a flex or grid element.
                        flexAndGridChildProperties.has(child.prop))
            )) ||
            (declaration.prop === 'position' && (declaration.value === 'fixed' || declaration.value === 'sticky')) ||
            (declaration.prop === 'opacity' && declaration.value !== '1') ||
            (declaration.prop === 'mix-blend-mode' && declaration.value !== 'normal') ||
            (declaration.prop === 'transform' && declaration.value !== 'none') ||
            (declaration.prop === 'filter' && declaration.value !== 'none') ||
            (declaration.prop === 'perspective' && declaration.value !== 'none') ||
            (declaration.prop === 'clip-path' && declaration.value !== 'none') ||
            (declaration.prop === 'mask' && declaration.value !== 'none') ||
            (declaration.prop === 'mask-image' && declaration.value !== 'none') ||
            (declaration.prop === 'mask-border' && declaration.value !== 'none') ||
            (declaration.prop === 'isolation' && declaration.value === 'isolate') ||
            (declaration.prop === '-webkit-overflow-scrolling' && declaration.value === 'touch') ||
            (declaration.prop === 'contain' &&
                (declaration.value === 'layout' ||
                    declaration.value === 'paint' ||
                    declaration.value === 'strict' ||
                    declaration.value === 'content')) ||
            (declaration.prop === 'will-change' &&
                declaration.value
                    .split(',')
                    .some(property => stackingContextEstablishingProperties.has(property.trim()))))
    )
}

export function isIneffectiveZIndexDeclaration(declaration: Declaration): boolean {
    return (
        // z-index is specified
        declaration.prop === 'z-index' &&
        declaration.value !== 'auto' &&
        !globalNeutralValues.has(declaration.value) &&
        // but rule does not establish stacking context
        !declaration.parent?.some(node => isDeclaration(node) && establishesStackingContext(node))
    )
}
