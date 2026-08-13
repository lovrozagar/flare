/**
 * IsRestoring context for hydration state
 *
 * Used to track when queries are being restored from persisted state,
 * preventing refetches during the restoration process.
 */

import type { Accessor } from "solid-js"
import { createContext, useContext } from "solid-js"

const IsRestoringContext = createContext<Accessor<boolean>>(() => false)

export const useIsRestoring = () => useContext(IsRestoringContext)
export const IsRestoringProvider = IsRestoringContext.Provider
