import { PluginData } from "../plugins/PluginData";
import { EventFilter, ignoreBots, ignoreSelf, onlyGuild, withFilters } from "./eventFilters";
import { Awaitable } from "../utils";
import { Lock } from "../locks/LockManager";
import { EventArguments, fromErisArgs, UnknownEventArguments } from "./eventArguments";
import { EventListenerBlueprint } from "./EventListenerBlueprint";
import { BasePluginType } from "../plugins/pluginTypes";

export interface EventMeta<TPluginType extends BasePluginType> {
  pluginData: PluginData<TPluginType>;

  // Added by locks() event filter
  lock?: Lock;
}

export type Listener<TPluginType extends BasePluginType, TEventName extends string> = (
  args: EventArguments[TEventName],
  meta: EventMeta<TPluginType>
) => Awaitable<void>;

export type WrappedListener = (args: any[]) => Awaitable<void>;

export interface PluginEventManagerOpts {
  implicitGuildRestriction?: boolean;
}

export interface OnOpts {
  allowOutsideOfGuild?: boolean;
  allowBots?: boolean;
  allowSelf?: boolean;
  filters?: EventFilter[];
}

/**
 * A wrapper for the Eris event emitter that passes plugin data to the listener
 * functions and, by default, restricts events to the plugin's guilds.
 */
export class PluginEventManager<TPluginType extends BasePluginType> {
  private listeners: Map<string, Set<WrappedListener>>;
  private pluginData: PluginData<TPluginType>;
  private readonly implicitGuildRestriction: boolean;

  constructor(opts?: PluginEventManagerOpts) {
    this.listeners = new Map();
    this.implicitGuildRestriction = opts?.implicitGuildRestriction !== false;
  }

  public setPluginData(pluginData: PluginData<TPluginType>) {
    if (this.pluginData) {
      throw new Error("Plugin data already set");
    }

    this.pluginData = pluginData;
  }

  public registerEventListener(blueprint: EventListenerBlueprint<TPluginType>): WrappedListener {
    if (!this.listeners.has(blueprint.event)) {
      this.listeners.set(blueprint.event, new Set());
    }

    const filters = blueprint.opts?.filters || [];

    if (this.implicitGuildRestriction && !blueprint.opts?.allowOutsideOfGuild) {
      filters.unshift(onlyGuild());
    }

    if (!blueprint.opts?.allowSelf) {
      filters.unshift(ignoreSelf());
    }

    if (!blueprint.opts?.allowBots) {
      filters.unshift(ignoreBots());
    }

    const filteredListener = withFilters(blueprint.event, blueprint.listener, filters);

    const wrappedListener: WrappedListener = (...args: any[]) => {
      const convertedArgs = fromErisArgs[blueprint.event]
        ? fromErisArgs[blueprint.event](...args)
        : ({ args } as UnknownEventArguments);

      return filteredListener(convertedArgs, {
        pluginData: this.pluginData,
      });
    };

    this.listeners.get(blueprint.event).add(wrappedListener);
    this.pluginData.client.on(blueprint.event, wrappedListener);

    return wrappedListener;
  }

  public on<TEventName extends string>(
    event: TEventName,
    listener: Listener<TPluginType, TEventName>,
    opts?: OnOpts
  ): WrappedListener {
    return this.registerEventListener({
      event,
      listener,
      opts,
    });
  }

  public off(event: string, listener: WrappedListener): void {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(listener);
      this.pluginData.client.off(event, listener);
    }

    return;
  }

  public async emit(event: string, args: any[]): Promise<boolean> {
    if (this.listeners.has(event)) {
      for (const listener of this.listeners.get(event)) {
        await listener(args);
      }

      return true;
    }

    return false;
  }

  public clearAllListeners() {
    for (const [event, listeners] of this.listeners.entries()) {
      for (const listener of listeners) {
        this.off(event, listener);
      }
    }
  }
}