/** EventNet
 * Created by X.Y.Z. at March 3rd, 2018.
 * @version 0.0.2
 */

import { IAttrFuncCondition, IAttrStore, IDictionary, IDownstreamLike, INode,
     INodeCode, INormalAttr, INormalAttrFunc, IStreamLike, IStreamOfElement, IUpstreamLike } from "./types";

/**
 * Create a EventNet Node
 * @param attrs - add attributes to Node.
 * @param states - add initial state to Node.
 * @param code - set the code that is executed when the Node runs.
 */
interface IEventNet {
    (attrs: IDictionary, states: IDictionary, code: INodeCode): Node;
    (attrs: IDictionary, code: INodeCode): Node;
    (codes: INodeCode): Node;
    installAttr: typeof installAttr;
    getAttrDefinition: (name: string) => string|[INormalAttrFunc|undefined, INormalAttrFunc|undefined]|false;
    defaultState: any;
}

const en: IEventNet = ((attrs: any, states?: any, code?: any) => {
    if (typeof attrs === "object" && typeof states === "object" && typeof code === "function") {
        return new Node(attrs, states, code);
    } else if (typeof attrs === "object" && typeof states === "function") {
        return new Node(attrs, {}, states);
    } else {
        return new Node({}, {}, code);
    }
}) as IEventNet;

export = en;

// The store of attributes
const attrStore: IAttrStore = {
    normalAttr: {},
    typedAttr: {},
};

function installAttr(name: string, type: "number" | "string" | "object" | "symbol" | "boolean" | "function"): void;
function installAttr(name: string, attr: INormalAttr): void;
function installAttr(name: any, value: any): void {
    // Parameter checking, remove in min&mon version
    if (typeof name !== "string") {
        throw new Error("EventNet.installAttr: name should be a string");
    }

    if (typeof value === "string") {
        attrStore.typedAttr[name] = value as "number" | "string" | "object" | "symbol" | "boolean" | "function";
    } else {
        if (value.before && typeof value.beforePriority === "undefined") {
            value.beforePriority = value.afterPriority || 0;
        }
        if (value.after && typeof value.afterPriority === "undefined") {
            value.afterPriority = value.beforePriority || 0;
        }
        attrStore.normalAttr[name] = value;
    }
}

en.installAttr = installAttr;

en.getAttrDefinition = (name: string) =>
    attrStore.typedAttr[name] ||
        (!attrStore.normalAttr[name].before && !attrStore.normalAttr[name].after) ?
            false :
            [(attrStore.normalAttr[name].before || void 0), (attrStore.normalAttr[name].after || void 0)];

// The default state of each new Node that already exists.
// The states of Node created by calling en() is the result
// of assigning parameter `states` to default state.
en.defaultState = {
    data: {},
    error: null,
    runTimes: 0,
    running: 0,
};

const upsWaitingLink: IDownstreamLike[] = [];

class Node implements INode {
    public upstream: IStreamOfElement = {
        add(ups: IUpstreamLike) {
            this._upstream.push(ups);
        },
        get(index?: number) {
            return typeof index === "undefined" ? this._upstream : this._upstream[index];
        },
        _upstream: [] as IUpstreamLike[],
    };
    public downstream: IStreamOfElement = {
        add(ups: IDownstreamLike) {
            this._downstream.push(ups);
        },
        get(index?: number) {
            return typeof index === "undefined" ? this._downstream : this._downstream[index];
        },
        _downstream: [] as IDownstreamLike[],
    };
    public parentNode: INode|undefined = void 0;
    private _watchers: IDictionary = []; ////////////////////////////////
    public get watchers() {
        return this._watchers;
    }

    public readonly code: INodeCode;

    public state: IDictionary;

    private _attr: IDictionary;
    private _inheritAttr: IDictionary;
    private attrBeforeSequence: Array<{name: string, value: any, priority: number}>;
    private attrAfterSequence: Array<{name: string, value: any, priority: number}>;
    public get attr(): IDictionary {
        return Object.assign({}, this._attr, this._inheritAttr);
    }
    public setAttr(attrs: Array<{name: string, value: any}>) {
        // Coding suggestion, remove in min&mon version
        console.warn("EventNet.Node.setAttr: Modify attribute after the Node was created is not recommended.");
        for (const attr of attrs) {
            this._attr[attr.name] = attr.value;
        }
        this.sortAttr();
    }
    public setInheritAttr(attrs: Array<{name: string, value: any}>) {
        for (const attr of attrs) {
            if (typeof this._attr[attr.name] !== "undefined") { continue; }
            this._inheritAttr[attr.name] = attr.value;
        }
        this.sortAttr();
    }

    private sortAttr() {
        this.attrBeforeSequence.length = 0;
        this.attrAfterSequence.length = 0;
        const attr = this.attr;
        for (const name of Object.keys(attr)) {
            if (typeof attr[name] === "undefined") { continue; }
            if (attrStore.normalAttr[name].before) {
                this.attrBeforeSequence.push({
                    name,
                    value: attr[name],
                    priority: attrStore.normalAttr[name].beforePriority!
                });
            }
            if (attrStore.normalAttr[name].after) {
                this.attrAfterSequence.push({
                    name,
                    value: attr[name],
                    priority: attrStore.normalAttr[name].afterPriority!
                });
            }
        }

        // Sort attributes based on priority.
        this.attrBeforeSequence.sort((a, b) => a.priority - b.priority);
        this.attrAfterSequence.sort((a, b) => b.priority - a.priority);
    }

    constructor(attr: IDictionary, state: IDictionary, code: INodeCode) {
        // Parameter checking, remove in min&mon version
        for (const name of Object.keys(attr)) {
            if (!attrStore.typedAttr[name] &&
                !attrStore.normalAttr[name].before &&
                !attrStore.normalAttr[name].after) {
                console.warn(`EventNet.Node: Attribution '${name}' has not been installed.`);
            }
            if (attrStore.typedAttr[name] &&
                typeof attr[name] !== attrStore.typedAttr[name]) {
                throw new Error(
                    `EventNet.Node: The type of attribution '${name}' must be ${attrStore.typedAttr[name]}.`
                );
            }
        }

        this.code = code;
        this._attr = attr;
        this.state = Object.assign(en.defaultState, state);

        this.sortAttr();

        for (const ups of upsWaitingLink) {
            ups.downstream.add(this);
            this.upstream.add(ups);
        }
        upsWaitingLink.length = 0;

    }
    public async run(data: any, caller?: IUpstreamLike) {
        //////////////////////////////
        try {
            await this._code(data, caller);
        } catch (error) {
            if (error === Node.shutByAttrBefore) {
                //////////////////////////////////////////////////////
            } else if (error === Node.shutByAttrAfter) {
                //////////////////////////////////////////////////////
            }
        }
    }
    private static shutByAttrBefore = Symbol();
    private static shutByAttrAfter = Symbol();
    private async _code(data: any, caller?: IUpstreamLike) {
        this.state.running++;

        const condition: IAttrFuncCondition = {
            data,
            attrValue: null,
            shut: false,
        };
        for (const attrObj of this.attrBeforeSequence) {
            condition.attrValue = attrObj.value;
            await attrStore.normalAttr[attrObj.name].before!(condition, this);
        }
        if (condition.shut) {
            this.state.running--;
            throw Node.shutByAttrBefore;
        }

        data = condition.data;

        try {
            if (this._attr.sync === true) {
                this.code();
            }
        } catch (error) {

        }
    }

}

installAttr("fold", "number");
installAttr("sync", "boolean");
installAttr("runPlan", {
    before(condition, currentNode) {
        // TODO
    },
    beforePriority: 100,
    after(condition, currentNode) {
        // TODO
    },
    afterPriority: 100,
});
installAttr("timelimit", {
    before(condition, currentNode) {
        // TODO
    },
    beforePriority: 100,
    after(condition, currentNode) {
        // TODO
    },
    afterPriority: 100,
});
