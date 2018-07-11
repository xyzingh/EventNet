/** EventNet
 * Created by X.Y.Z. at March 3rd, 2018.
 * @version 0.0.2
 */

import {
    IAttrFuncCondition, IAttrStore, ICallableElementLike, IDictionary, IElementLike, ILine,
    INode, INodeCode, INodeCodeDWS, INodeRunningStage, INormalAttr, INormalAttrFunc,
    IStreamOfElement, ITypedDictionary
} from "./types";

/**
 * Create a EventNet Node
 * @param attrs - add attributes to Node.
 * @param states - add initial state to Node.
 * @param code - set the code that is executed when the Node runs.
 */
interface IEventNet {
    (attrs: IDictionary, states: IDictionary, code: INodeCode): Node;
    (attrs: IDictionary, code: INodeCode): Node;
    (code: INodeCode): Node;
    installAttr: typeof installAttr;
    getAttrDefinition: (name: string) =>
        string
        | [INormalAttrFunc | undefined, INormalAttrFunc | undefined, INormalAttrFunc | undefined]
        | undefined;
    defaultState: any;
}

const en = ((attrs: any, states?: any, code?: any) => {
    if (typeof attrs === "object" && typeof states === "object" && typeof code === "function") {
        return new Node(attrs, states, code);
    } else if (typeof attrs === "object" && typeof states === "function") {
        return new Node(attrs, {}, states);
    } else {
        return new Node({}, {}, attrs);
    }
}) as IEventNet;

export = en;

// The store of attributes.
const attrStore: IAttrStore = {
    normalAttr: {},
    typedAttr: {},
};

function installAttr(name: string, type: "number" | "string" | "object" | "symbol" | "boolean" | "function"): void;
function installAttr(name: string, attr: INormalAttr): void;
function installAttr(name: any, value: any): void {
    // Parameter checking, remove in min&mon version.
    if (typeof name !== "string") {
        throw new Error("EventNet.installAttr: name should be a string");
    }

    if (typeof value === "string") {
        attrStore.typedAttr[name] = value as "number" | "string" | "object" | "symbol" | "boolean" | "function";
    } else {
        if (typeof value.priority === "undefined") {
            value.priority = 9999;
        }
        if (value.before && typeof value.beforePriority === "undefined") {
            value.beforePriority = value.priority;
        }
        if (value.after && typeof value.afterPriority === "undefined") {
            value.afterPriority = value.priority;
        }
        if (value.finish && typeof value.finishPriority === "undefined") {
            value.finishPriority = value.priority;
        }
        value.priority = void 0;
        attrStore.normalAttr[name] = value;
    }
}

en.installAttr = installAttr;

en.getAttrDefinition = (name: string) =>
    attrStore.typedAttr[name] ||
        (!attrStore.normalAttr[name].before
        && !attrStore.normalAttr[name].after
        && !attrStore.normalAttr[name].finish) ?
            void 0 :
            [(attrStore.normalAttr[name].before || void 0),
            (attrStore.normalAttr[name].after || void 0),
            (attrStore.normalAttr[name].finish || void 0)];

// The default state of each new Node that already exists.
// The states of Node created by calling en() is the result
// of assigning parameter `states` to default state.
en.defaultState = {
    data: {},
    error: null,
    runTimes: 0,
    running: 0,
};

const upsWaitingLink: ILine[] = [];
class StreamOfNode implements IStreamOfElement {
    public add(stream: ILine) {
        this.content.push(stream);
        this.wrappedContent.push(this.wrapper(stream));
        if (typeof stream.id !== "undefined") {
            // Parameter checking, remove in min&mon version.
            if (typeof this.contentById[stream.id] !== "undefined") {
                throw new Error("EventNet.StreamOfNode.add: The stream of the same id already exists.");
            }
            this.contentById[stream.id] = stream;
        }
    }
    public get(index?: number): ILine | ILine[] | undefined {
        return typeof index === "undefined" ? this.content : this.content[index];
    }
    public getById(id?: string): ILine | ITypedDictionary<ILine> | undefined {
        return typeof id === "undefined" ? this.contentById : this.contentById[id];
    }
    private content: ILine[] = [];
    private contentById: ITypedDictionary<ILine> = {};
    public wrappedContent: any = [];
    private wrapper: (line: ILine) => any;
    constructor(wrapper?: (line: ILine) => any) {
        this.wrapper = wrapper || ((line) => { });
    }
}

class Node implements INode {
    public upstream = new StreamOfNode();
    public downstream = new StreamOfNode((line) => {
        const func: ICallableElementLike = ((data?: any) => {
            data = this.codeDwsDataAttrAfterProcess(data, false);
            line.run(data, this);
        }) as ICallableElementLike;
        func.origin = line;
        return func;
    });
    public parentNode: INode | undefined = void 0;
    private _watchers: IDictionary = []; ////////////////////////////////
    public get watchers() {
        return this._watchers;
    }

    public state: IDictionary;

    private _attr: IDictionary;
    private _inheritAttr: IDictionary;
    private attrBeforeSequence: Array<{ name: string, value: any, priority: number }>;
    private attrAfterSequence: Array<{ name: string, value: any, priority: number }>;
    private attrFinishSequence: Array<{ name: string, value: any, priority: number }>;
    public get attr(): IDictionary {
        // Only the clone with its own property is exposed,
        // so modifying `attr` is invalid.
        // The inherited property is not exposed.
        return Object.assign({}, this._attr);
    }
    public setAttr(attrs: Array<{ name: string, value: any }>) {
        // Coding suggestion, remove in min&mon version.
        console.warn("EventNet.Node.setAttr: Modify attribute while the Node is running may cause unknown errors.");
        for (const attr of attrs) {
            this._attr[attr.name] = attr.value;
        }
        this.sortAttr();
    }
    public setInheritAttr(attrs: Array<{ name: string, value: any }>) {
        for (const attr of attrs) {
            this._inheritAttr[attr.name] = attr.value;
        }
        this.sortAttr();
    }
    private sortAttr() {
        this.attrBeforeSequence.length = 0;
        this.attrAfterSequence.length = 0;
        this.attrFinishSequence.length = 0;
        const attr = this._attr;
        for (const name in attr) {
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
            if (attrStore.normalAttr[name].finish) {
                this.attrFinishSequence.push({
                    name,
                    value: attr[name],
                    priority: attrStore.normalAttr[name].finishPriority!
                });
            }
        }

        // Sort attributes based on priority.
        this.attrBeforeSequence.sort((a, b) => a.priority - b.priority);
        this.attrAfterSequence.sort((a, b) => b.priority - a.priority);
        this.attrFinishSequence.sort((a, b) => b.priority - a.priority);
    }

    constructor(attr: IDictionary, state: IDictionary, code: INodeCode) {

        // Parameter checking, remove in min&mon version.
        if (typeof attr.sync !== "undefined" && typeof attr.sync !== "boolean") {
            throw new Error("EventNet.Node: Attribution 'sync' must be true or false.");
        }
        for (const name of Object.keys(attr)) {
            if (!attrStore.typedAttr[name] &&
                !attrStore.normalAttr[name].before &&
                !attrStore.normalAttr[name].after &&
                !attrStore.normalAttr[name].finish) {
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
        Object.assign(this.downstream.wrappedContent, {
            all: Node.codeParamDws.all.bind(this),
            get: Node.codeParamDws.get.bind(this),
            dispense: Node.codeParamDws.dispense.bind(this),
        });
        this.codeParam = {
            dws: this.downstream.wrappedContent,
        };

        this._inheritAttr = {};
        this._attr = Object.assign(Object.create(this._inheritAttr), attr);
        if (typeof this._attr.sync === "undefined") {
            this._attr.sync = false;
        }
        this.sortAttr();

        this.state = Object.assign({}, en.defaultState, state);

        for (const ups of upsWaitingLink) {
            ups.downstream.add(this);
            this.upstream.add(ups);
        }
        upsWaitingLink.length = 0;
    }
    public run(data: any, caller?: IElementLike) {
        if (this._attr.sync) {
            try {
                return this._codeSync(data, caller);
            } catch (error) {
                ////////////////////////////////////////////////////////////////
            }
        } else {
            return this._codeAsync(data, caller).catch((error) => {
                ////////////////////////////////////////////////////////////////
            });
        }
        //////////////////////////////
        // Try-catch will copy all the variables in the current scope.
    }

    public readonly code: INodeCode;
    private errorHandler(when: INodeRunningStage, what?: any) {
        //////////////////////////////////////////////////////////////////////////////////
    }
    private async _codeAsync(data: any, caller?: ILine): Promise<any> {
        let runningStage: INodeRunningStage = INodeRunningStage.before;

        this.state.running++;

        let shutByAttrBefore = false;
        let errorInAttrBefore: any;
        const conditionBefore: IAttrFuncCondition = {
            data,
            attrValue: null,
            shut: (error?: any) => {
                shutByAttrBefore = true;
                if (typeof error === "undefined") { return; }
                if (runningStage === INodeRunningStage.before) {
                    errorInAttrBefore = error;
                } else {
                    // Does not report in which operation and which attribute the error occurred for higher performance.
                    this.errorHandler(INodeRunningStage.before, error);
                }
            },
        };
        for (const attrObj of this.attrBeforeSequence) {
            conditionBefore.attrValue = attrObj.value;
            await attrStore.normalAttr[attrObj.name].before!(conditionBefore, this, this._attr.sync);
            if (shutByAttrBefore) {
                this.state.running--;
                throw { subject: INodeRunningStage.before, errorInAttrBefore };
            }
        }
        runningStage = INodeRunningStage.code;
        data = conditionBefore.data;

        const result = await this.code(this.codeParam.dws, { data, caller }, { origin: this });

        if (this.attrFinishSequence.length !== 0) {
            runningStage = INodeRunningStage.finish;

            let shutByAttrFinish = false;
            let errorInAttrFinish: any;
            const conditionFinish: IAttrFuncCondition = {
                attrValue: null,
                shut: (error?: any) => {
                    shutByAttrFinish = true;
                    if (typeof error === "undefined") { return; }
                    errorInAttrFinish = error;
                },
            };
            for (const attrObj of this.attrFinishSequence) {
                conditionBefore.attrValue = attrObj.value;
                await attrStore.normalAttr[attrObj.name].finish!(conditionFinish, this, this._attr.sync);
                if (shutByAttrFinish) {
                    this.state.running--;
                    throw { subject: INodeRunningStage.finish, errorInAttrFinish };
                }
            }
        }

        runningStage = INodeRunningStage.over;
        this.state.running--;

        return result;
    }
    private _codeSync(data: any, caller?: ILine): any {
        let runningStage: INodeRunningStage = INodeRunningStage.before;

        this.state.running++;

        let shutByAttrBefore = false;
        let errorInAttrBefore: any;
        const conditionBefore: IAttrFuncCondition = {
            data,
            attrValue: null,
            shut: (error?: any) => {
                shutByAttrBefore = true;
                if (typeof error === "undefined") { return; }
                if (runningStage === INodeRunningStage.before) {
                    errorInAttrBefore = error;
                } else {
                    // Does not report in which operation and which attribute the error occurred for higher performance.
                    this.errorHandler(INodeRunningStage.before, error);
                }
            },
        };
        for (const attrObj of this.attrBeforeSequence) {
            conditionBefore.attrValue = attrObj.value;
            attrStore.normalAttr[attrObj.name].before!(conditionBefore, this, this._attr.sync);
            if (shutByAttrBefore) {
                this.state.running--;
                throw { subject: INodeRunningStage.before, errorInAttrBefore };
            }
        }
        runningStage = INodeRunningStage.code;
        data = conditionBefore.data;

        const result = this.code(this.codeParam.dws, { data, caller }, { origin: this });

        if (this.attrFinishSequence.length !== 0) {
            runningStage = INodeRunningStage.finish;

            let shutByAttrFinish = false;
            let errorInAttrFinish: any;
            const conditionFinish: IAttrFuncCondition = {
                attrValue: null,
                shut: (error?: any) => {
                    shutByAttrFinish = true;
                    if (typeof error === "undefined") { return; }
                    errorInAttrFinish = error;
                },
            };
            for (const attrObj of this.attrFinishSequence) {
                conditionBefore.attrValue = attrObj.value;
                attrStore.normalAttr[attrObj.name].finish!(conditionFinish, this, this._attr.sync);
                if (shutByAttrFinish) {
                    this.state.running--;
                    throw { subject: INodeRunningStage.finish, errorInAttrFinish };
                }
            }
        }

        runningStage = INodeRunningStage.over;
        this.state.running--;

        return result;
    }
    private codeParam: { dws: INodeCodeDWS };
    private static codeParamDws = {
        all(this: Node, data: any) {
            if (typeof data !== "undefined") {
                data = this.codeDwsDataAttrAfterProcess(data, false);
            }
            for (const dws of (this.downstream.get() as IElementLike[])) {
                dws.run(data, this);
            }
        },
        get(this: Node, id: string, data?: any) {
            const downstream = this.downstream.getById(id);

            // Downstream presence checking, remove in min&mon version.
            if (typeof downstream === "undefined") {
                console.warn(`EventNet.Node.codeParamDws.get: There is no downstream of ID '${id}'.`);
                return void 0;
            }

            if (typeof data !== "undefined") {
                data = this.codeDwsDataAttrAfterProcess(data, false);
                (downstream as ILine).run(data, this);
            }
            return downstream;
        },
        // tslint:disable-next-line:variable-name
        dispense(this: Node, IdValue_or_IndexValue: IDictionary) {
            IdValue_or_IndexValue = this.codeDwsDataAttrAfterProcess(IdValue_or_IndexValue, true);
            let downstream: ILine | undefined;
            if (isNaN(Number(Object.keys(IdValue_or_IndexValue)[0]))) {
                // Identify 'keyValue' with ID-value type.
                for (const id of Object.keys(IdValue_or_IndexValue)) {
                    downstream = this.downstream.getById(id) as ILine | undefined;

                    // Downstream presence checking, remove in min&mon version.
                    if (typeof downstream !== "undefined") {
                        downstream.run(IdValue_or_IndexValue[id], this);
                    } else {
                        console.warn(`EventNet.Node.codeParamDws.get: There is no downstream of ID '${id}'.`);
                    }
                }
            } else {
                // Identify 'keyValue' with index-value type.
                // tslint:disable-next-line:forin
                for (const index in IdValue_or_IndexValue) {
                    downstream = this.downstream.get(Number(index)) as ILine | undefined;

                    // Downstream presence checking, remove in min&mon version.
                    if (typeof downstream !== "undefined") {
                        downstream.run(IdValue_or_IndexValue[index], this);
                    } else {
                        console.warn(`EventNet.Node.codeParamDws.get: There is no downstream of ID '${index}'.`);
                    }
                }
            }
        },
    };
    private codeDwsDataAttrAfterProcess(data: any, collection: boolean) {
        // Speed up the operation of the function.
        if (this.attrAfterSequence.length === 0) {
            return data;
        }

        let shutByAttrAfter = false;
        let errorInAttrAfter: any;

        const condition: IAttrFuncCondition = {
            data,
            attrValue: null,
            shut: (error?: any) => {
                shutByAttrAfter = true;
                if (typeof error === "undefined") { return; }
                errorInAttrAfter = error;
            },
            collection,
        };
        for (const attrObj of this.attrAfterSequence) {
            condition.attrValue = attrObj.value;
            attrStore.normalAttr[attrObj.name].after!(condition, this, this._attr.sync);
            if (shutByAttrAfter) {
                this.state.running--;
                throw { subject: INodeRunningStage.after, errorInAttrAfter };
            }
        }
        return condition.data;
    }
}
installAttr("fold", "number");
installAttr("sync", "boolean");
installAttr("runPlan", {
    before(condition, currentNode, isSync) {
        // TODO
    },
    beforePriority: 100,
    after(condition, currentNode, isSync) {
        // TODO
    },
    afterPriority: 100,
});
installAttr("timelimit", {
    before(condition, currentNode, isSync) {
        // TODO
    },
    beforePriority: 100,
    after(condition, currentNode, isSync) {
        // TODO
    },
    afterPriority: 100,
});
