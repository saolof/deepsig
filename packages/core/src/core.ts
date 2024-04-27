/**
 * AtomicState
 * @typedef {(Array<unknown>|(function(...*):unknown)|string|boolean|number|bigint|symbol|undefined|null|Map<unknown,unknown>|Set<unknown>|Date)} AtomicState
 */

/**
 * DeepState
 * @typedef {Object.<string, (() => unknown)|AtomicState|DeepState>} DeepState
 */

/*
export interface DeepSignalAccessors<T extends DeepState> {
  value: ReadOnlyDeep<T>;
  readonly peek: () => ReadOnlyDeep<T>;
}

export type DeepSignalType<T extends DeepState> = DeepSignalAccessors<T> & {
  [K in keyof T]: T[K] extends AtomicState
    ? Signal<T[K]>
    : T[K] extends DeepState
    ? DeepSignalType<T[K]>
    : Signal<T[K]>;
};

TODO: fill the rest out or just switch to the d.ts approach
*/


import { signal, Signal, batch } from "@preact/signals-core";


export class DeepSignal {
  constructor(initialValue = {}) {
    Object.defineProperty(this, "value", {
      get() {
        return getValue(this)
      },
      set(payload) {
        batch(() => setValue(this, payload))
      },
      enumerable: false,
      configurable: false
    })

    Object.defineProperty(this, "peek", {
      value: () => getValue(this, { peek: true }),
      writable: false,
      enumerable: false,
      configurable: false
    })

    Object.defineProperty(this, "__INTERNAL_latestUpdatedStructurePayload", {
      value: new Signal(initialValue),
      writable: false,
      enumerable: false,
      configurable: false
    })
  }
}

const isAtomic = value =>
  typeof value !== "object" ||
  value?.constructor === Date ||
  value?.constructor === Map ||
  value?.constructor === Set ||
  value === null ||
  Array.isArray(value)

const validateKey = key => {
  if (
    ["value", "peek", "__INTERNAL_latestUpdatedStructurePayload"].some(
      iKey => iKey === key
    )
  ) {
    throw new Error(`${key} is a reserved property name`)
  }
}

export const deepSignal = initialValue =>
  Object.assign(
    new DeepSignal(initialValue),
    Object.entries(initialValue).reduce((acc, [key, value]) => {
      validateKey(key)
      if (isAtomic(value)) {
        acc[key] = signal(value)
      } else {
        acc[key] = deepSignal(value)
      }
      return acc
    }, {})
  )

const setValue = (deep, payload) => {
  let structureChanged = false
  Object.keys(payload).forEach(key => {
    if (deep[key]) {
      if (deep[key] instanceof Signal) {
        deep[key].value = payload[key]
      } else {
        const nestedStructureChanged = setValue(deep[key], payload[key])
        if (nestedStructureChanged) {
          structureChanged = true
        }
      }
    } else {
      validateKey(key)
      deep[key] = isAtomic(payload[key])
        ? signal(payload[key])
        : deepSignal(payload[key])
      structureChanged = true
    }
  })
  Object.keys(deep).forEach(key => {
    if (!payload[key]) {
      deep[key].value = deep[key] instanceof DeepSignal ? {} : undefined
      delete deep[key]
      structureChanged = true
    }
  })
  if (structureChanged) {
    deep.__INTERNAL_latestUpdatedStructurePayload.value = payload
  }
  return structureChanged
}

const getValue = (deepSignal, { peek = false } = {}) => {
  if (!peek) {
    // calling the .value to track changes to the structure of this DeepSignal
    deepSignal.__INTERNAL_latestUpdatedStructurePayload.value
  }
  return Object.entries(deepSignal).reduce((acc, [key, value]) => {
    if (value instanceof Signal) {
      acc[key] = peek ? value.peek() : value.value
    } else if (value instanceof DeepSignal) {
      acc[key] = getValue(value, { peek })
    }
    return acc
  }, {})
}
