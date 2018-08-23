import { getElementProducer } from '../element';
import { NormalNode } from '../normal-node';
import {
  ElementType,
  ICallableElementLike,
  IDictionary,
  INodeLike,
  IWatchableElement,
} from '../types';
import { handleError, isPipe } from '../util';
import { weld } from '../weld';
import { Arrow, Pipe, Twpipe } from './../line';

export const stareArrow = getElementProducer((
  target: IWatchableElement,
  expOrFn: string | ((this: IDictionary, target: IDictionary) => any),
  callback: (newVal: any, dws: ICallableElementLike | undefined, oldVal: any) => any =
    (newVal, dws) => dws && dws(),
  {
    deep = false,
    sync = false,
    immediate = false,
  }: { deep?: boolean, sync?: boolean, immediate?: boolean }  = {},
  { id, classes }: { id?: string, classes?: string[] } = {},
) => {
  const line = new Arrow(null, null, { id, classes });

  target.watchMe(expOrFn, (newVal: any, oldVal: any) => {
    let dws: ICallableElementLike | undefined;
    if (line.downstream.element) {
      // tslint:disable-next-line:only-arrow-functions
      dws = (function() {
        if (process.env.NODE_ENV !== 'production' && arguments.length) {
          handleError(new Error(`data '${
            String(arguments[0]).length > 20 ?
              String(arguments[0]).substr(0, 20) + '...' : String(arguments[0])
            }' can not pass through StareArrow, replace with StarePipe`), 'StareArrow', line);
        }
        line.downstream.element!.run(void 0, line);
      }) as ICallableElementLike;
      dws.origin = line.downstream.element;
    }
    const result = callback(newVal, dws, oldVal);
    if (process.env.NODE_ENV !== 'production' && typeof result !== 'undefined' && result !== null) {
      handleError(new Error(`data '${
        String(result).length > 20 ?
          String(result).substr(0, 20) + '...' : String(result)
        }' can not pass through StareArrow, replace with StarePipe`), 'StareArrow', line);
    }

  }, { deep, sync, immediate });

  return line;
}, 'stareArrow');

export const starePipe = getElementProducer((
  target: IWatchableElement,
  expOrFn: string | ((this: IDictionary, target: IDictionary) => any),
  callback: (newVal: any, dws: ICallableElementLike | undefined, oldVal: any) => any =
    (newVal, dws) => dws && dws(newVal),
  {
    deep = false,
    sync = false,
    immediate = false,
  }: { deep?: boolean, sync?: boolean, immediate?: boolean } = {},
  { id, classes }: { id?: string, classes?: string[] } = {},
) => {
  const line = new Pipe(null, null, { id, classes });

  target.watchMe(expOrFn, (newVal: any, oldVal: any) => {
    let dws: ICallableElementLike | undefined;
    if (line.downstream.element) {
      dws = ((d: any) => {
        line.downstream.element!.run(d, line);
      }) as ICallableElementLike;
      dws.origin = line.downstream.element;
    }
    const result = callback(newVal, dws, oldVal);
    if (typeof result !== 'undefined' && line.downstream.element) {
      line.downstream.element!.run(result, line);
    }
  }, { deep, sync, immediate });

  return line;
}, 'starePipe');

export const stareTwpipe = getElementProducer((
  upsTarget: IWatchableElement & INodeLike,
  upsExpOrFn: string | ((this: IDictionary, target: IDictionary) => any),
  dwsTarget: IWatchableElement & INodeLike,
  dwsExpOrFn: string | ((this: IDictionary, target: IDictionary) => any),
  callback: (
    upsNewVal: any,
    dwsNewVal: any,
    ups: ICallableElementLike | undefined,
    dws: ICallableElementLike | undefined,
    upsOldVal: any,
    dwsOldVal: any,
  ) => void,
  {
    deep = false,
    sync = false,
    immediate = false,
  }: { deep?: boolean, sync?: boolean, immediate?: boolean } = {},
  { id, classes }: { id?: string, classes?: string[] } = {},
) => {
  const line = new Twpipe(null, null, { id, classes });
  weld(line.upstream, upsTarget.upstream);
  weld(line.downstream, dwsTarget.upstream);

  let upsOldVal: any = void 0;
  let dwsOldVal: any = void 0;

  const run = (upsValue: any, dwsValue: any, upsOldValue: any, dwsOldValue: any) => {
    let dws: ICallableElementLike | undefined;
    if (line.downstream.element) {
      // tslint:disable-next-line:only-arrow-functions
      dws = ((d: any) => {
        line.downstream.element!.run(d, line);
      }) as ICallableElementLike;
      dws.origin = line.downstream.element;
    }
    let ups: ICallableElementLike | undefined;
    if (line.upstream.element) {
      // tslint:disable-next-line:only-arrow-functions
      ups = ((d: any) => {
        line.upstream.element!.run(d, line);
      }) as ICallableElementLike;
      ups.origin = line.upstream.element;
    }

    callback(upsValue, dwsValue, ups, dws, upsOldValue, dwsOldValue);
  };

  upsTarget.watchMe(upsExpOrFn, (newVal: any, oldVal: any) => {
    run(newVal, void 0, oldVal, dwsOldVal);
    upsOldVal = newVal;
  }, { deep, sync, immediate });
  dwsTarget.watchMe(dwsExpOrFn, (newVal: any, oldVal: any) => {
    run(void 0, newVal, upsOldVal, oldVal);
    dwsOldVal = newVal;
  }, { deep, sync, immediate });

  return line;
}, 'stareTwpipe');

declare module '../normal-node' {
  // tslint:disable-next-line:interface-name
  interface NormalNode {
    createStareLine: typeof createStareLine;
    createStareArrow: typeof createStareArrow;
    createStarePipe: typeof createStarePipe;
  }
}

function createStareLine(
  this: NormalNode,
  type: ElementType,
  node: INodeLike,
  expOrFn: string | (() => any),
  callback: (newVal: any, dws: ICallableElementLike | undefined, oldVal: any) => any,
  {
    deep = false,
    sync = false,
    immediate = false,
  }: { deep?: boolean, sync?: boolean, immediate?: boolean } = {},
  { id, classes }: { id?: string, classes?: string[] } = {},
) {
  const ctor = isPipe(type) ? starePipe : stareArrow;
  const line = ctor(
    this,
    expOrFn,
    callback,
    { deep, sync, immediate },
    { id, classes },
  );
  weld(line.downstream, node.upstream);
  return line;
}

export const [createStareArrow, createStarePipe] =
  ((types: number[], fn) => [fn(types[0]), fn(types[1])])
    (
    [ElementType.Arrow, ElementType.Pipe],
    (t: ElementType) => function(
      this: NormalNode,
      node: INodeLike,
      expOrFn: string | (() => any),
      callback: (newVal: any, dws: ICallableElementLike | undefined, oldVal: any) => any,
      {
        deep = false,
        sync = false,
        immediate = false,
      }: { deep?: boolean, sync?: boolean, immediate?: boolean } = {},
      { id, classes }: { id?: string, classes?: string[] } = {},
    ) {
      return this.createStareLine(t, node, expOrFn, callback, { deep, sync, immediate }, { id, classes });
    });

NormalNode.prototype.createStareLine = createStareLine;
NormalNode.prototype.createStareArrow = createStareArrow;
NormalNode.prototype.createStarePipe = createStarePipe;
