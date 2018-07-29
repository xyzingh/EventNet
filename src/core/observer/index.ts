import { isPrimitive } from 'util';
import {
  copyAugment, def, hasOwn,
  hasProto, isObject, isPlainObject,
  isValidArrayIndex, protoAugment, warn,
} from '../util';
import { arrayMethods, methodsToPatch } from './array';
import Dep from './dep';

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
export function observe(value: any) {
  if (!isObject(value)) {
    return;
  }

  let ob: Observer | void;
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__;
  } else if (
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value)
  ) {
    ob = new Observer(value);
  }
  return ob;
}

const augment = (Object as any).setPrototypeOf ||
  (hasProto ? protoAugment : copyAugment);

export class Observer {
  public value: any;
  public dep: Dep;
  constructor(value: any, except: string = '') {
    this.value = value;
    this.dep = new Dep();
    def(value, '__ob__', this);
    if (Array.isArray(value)) {
      augment(value, arrayMethods, methodsToPatch);
      this.observeArray(value);
    } else if (!except) {
      this.walk(value);
    } else {
      this.walkExcept(value, except);
    }
  }
  public walk(value: any) {
    for (const key of Object.keys(value)) {
      defineReactive(value, key);
    }
  }
  public walkExcept(value: any, except: string) {
    for (const key of Object.keys(value)) {
      if (key === except) { continue; }
      defineReactive(value, key);
    }

  }
  public observeArray(items: any[]) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i]);
    }
  }
}

function defineReactive(obj: any, key: string, val?: any) {
  const dep = new Dep();

  const property = Object.getOwnPropertyDescriptor(obj, key);
  if (property && property.configurable === false) {
    return;
  }

  const getter = property!.get;
  const setter = property!.set;
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key];
  }

  let childOb = observe(val);
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get() {
      const value = getter ? getter.call(obj) : val;

      if (Dep.target) {
        dep.depend();
        if (childOb) {
          childOb.dep.depend();
          if (Array.isArray(value)) {
            dependArray(value);
          }
        }
      }

      return value;
    },
    set(newVal) {
      const value = getter ? getter.call(obj) : val;
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return;
      }
      if (setter) {
        setter.call(obj, newVal);
      } else {
        val = newVal;
      }
      childOb = observe(newVal);
      dep.notify();
    },
  });
}

function dependArray(value: any[]) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i];
    e && e.__ob__ && e.__ob__.dep.depend();
    if (Array.isArray(e)) {
      dependArray(e);
    }
  }
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set(target: any, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    typeof target === 'undefined' || isPrimitive(target)) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${target}`);
  }
  if (Array.isArray(target)) {
    if (isValidArrayIndex(key)) {
      target.length = Math.max(target.length, key);
      target.splice(key, 1, val);
    } else {
      target[key] = val;
    }
    return val;
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val;
    return val;
  }
  const ob = target.__ob__;
  if (!ob) {
    target[key] = val;
    return val;
  }
  defineReactive(ob.value, key, val);
  ob.dep.notify();
  return val;
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del(target: any, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (typeof target === 'undefined' || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${target}`);
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1);
    return;
  }
  if (!hasOwn(target, key)) {
    return;
  }
  delete target[key];
  const ob = target.__ob__;
  if (!ob) {
    return;
  }
  ob.dep.notify();
}
