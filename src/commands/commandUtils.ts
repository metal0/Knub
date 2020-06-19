import { Client, GroupChannel, GuildChannel, Message, PrivateChannel } from "eris";
import { Awaitable } from "../utils";
import { ICommandConfig, ICommandDefinition, IParameter, TOption, TSignature } from "knub-command-manager";
import { Lock } from "../locks/LockManager";
import { PluginData } from "../plugins/PluginData";
import { hasPermission } from "../helpers";
import { CommandBlueprint } from "./CommandBlueprint";
import { BasePluginType } from "../plugins/pluginTypes";

export type TSignatureOrArray<TPluginType extends BasePluginType> =
  | TSignature<CommandContext<TPluginType>>
  | Array<TSignature<CommandContext<TPluginType>>>;

export function getDefaultPrefix(client: Client): RegExp {
  return new RegExp(`<@!?${client.user.id}> `);
}

export interface CommandMeta<TPluginType extends BasePluginType> {
  message: Message;
  command: ICommandDefinition<any, any>;
  pluginData: PluginData<TPluginType>;
  lock?: Lock;
}

/**
 * Command signatures are objects where each property contains a parameter/option object.
 * Each parameter/option object in turn contains a `type` function. ArgsFromSignature maps the signature object
 * to the return types of said type functions. For example, if the signature had a "name" property with a type function
 * that returns a string, ArgsFromSignature would return `{ name: string }`.
 */
type ArgsFromSignature<T extends TSignature<any>> = {
  [K in keyof T]: ParameterOrOptionType<T[K]>;
};

/**
 * Higher level wrapper for ArgsFromSignature that also supports multiple signatures,
 * returning a union type of possible sets of arguments.
 */
export type ArgsFromSignatureOrArray<T extends TSignatureOrArray<any>> = ArgsFromSignatureUnion<
  SignatureToArray<T>[number]
>;

// Needed to distribute the union type properly
// See https://github.com/microsoft/TypeScript/issues/28339#issuecomment-463577347
type ArgsFromSignatureUnion<T extends TSignature<any>> = T extends any ? ArgsFromSignature<T> : never;

type SignatureToArray<T> = T extends any[] ? T : [T];

type PromiseType<T> = T extends PromiseLike<infer U> ? U : T;

type ParameterOrOptionType<T extends IParameter<any> | TOption<any>> = PromiseType<ReturnType<T["type"]>>;

export type CommandFn<TPluginType extends BasePluginType, _TSignature extends TSignatureOrArray<TPluginType>> = (
  args: ArgsFromSignatureOrArray<_TSignature>,
  meta: CommandMeta<TPluginType>
) => Awaitable<void>;

export interface CommandContext<TPluginType extends BasePluginType> {
  message: Message;
  pluginData: PluginData<TPluginType>;
  lock?: Lock;
}

export interface CommandExtraData<TPluginType extends BasePluginType> {
  blueprint: CommandBlueprint<TPluginType, any>;
  _lock?: Lock;
}

export type PluginCommandDefinition = ICommandDefinition<CommandContext<any>, CommandExtraData<any>>;
export type PluginCommandConfig = ICommandConfig<CommandContext<any>, CommandExtraData<any>>;

/**
 * Returns a readable command signature string for the given command.
 * Trigger is passed as a string instead of using the "triggers" property of the command to allow choosing which
 * trigger of potentially multiple ones to show and in what format.
 */
export function getCommandSignature(
  command: PluginCommandDefinition,
  overrideTrigger?: string,
  overrideSignature?: TSignature<any>
) {
  const signature = overrideSignature || command.signatures[0];
  const signatureEntries = Object.entries(signature);
  const parameters = signatureEntries.filter(([_, param]) => param.option !== true) as Array<[string, IParameter<any>]>;
  const options = signatureEntries.filter(([_, opt]) => opt.option === true) as Array<[string, TOption<any>]>;

  const paramStrings = parameters.map(([name, param]) => {
    return param.required ? `<${name}>` : `[${name}]`;
  });
  const optStrings = options.map(([name, _opt]) => {
    return `[-${name}]`;
  });

  const prefix =
    command.originalPrefix != null
      ? typeof command.originalPrefix === "string"
        ? command.originalPrefix
        : command.originalPrefix.source
      : null;

  const trigger =
    overrideTrigger != null
      ? overrideTrigger
      : typeof command.originalTriggers[0] === "string"
      ? command.originalTriggers[0]
      : command.originalTriggers[0].source;

  const usageLine = `${prefix}${trigger} ${paramStrings.join(" ")} ${optStrings.join(" ")}`.replace(/\s+/g, " ").trim();

  return usageLine;
}

/**
 * Command pre-filter to restrict the command to the plugin's guilds, unless
 * allowed for DMs
 */
export function restrictCommandSource(cmd: PluginCommandDefinition, context: CommandContext<any>): boolean {
  let source = cmd.config.extra?.blueprint.source ?? "guild";
  if (!Array.isArray(source)) source = [source];

  if (context.message.channel instanceof PrivateChannel && source.includes("dm")) {
    return true;
  }

  if (context.message.channel instanceof GroupChannel && source.includes("group")) {
    return true;
  }

  if (context.message.channel instanceof GuildChannel && source.includes("guild")) {
    return true;
  }

  return false;
}

/**
 * Command pre-filter to restrict the command by specifying a required
 * permission
 */
export function checkCommandPermission(cmd: PluginCommandDefinition, context: CommandContext<any>): boolean {
  const permission = cmd.config.extra?.blueprint.permission;
  if (permission) {
    const config = context.pluginData.config.getForMessage(context.message);
    if (!hasPermission(config, permission)) {
      return false;
    }
  }

  return true;
}

/**
 * Command post-filter to check if the command's on cooldown and, if not, to put
 * it on cooldown
 */
export function checkCommandCooldown(cmd: PluginCommandDefinition, context: CommandContext<any>): boolean {
  if (cmd.config.extra?.blueprint.cooldown) {
    const cdKey = `${cmd.id}-${context.message.author.id}`;

    const cdValue =
      typeof cmd.config.extra.blueprint.cooldown === "object"
        ? cmd.config.extra.blueprint.cooldown.amount
        : cmd.config.extra.blueprint.cooldown;
    const cdPermission =
      typeof cmd.config.extra.blueprint.cooldown === "object" ? cmd.config.extra.blueprint.cooldown.permission : null;

    let cdApplies = true;
    if (cdPermission) {
      const config = context.pluginData.config.getForMessage(context.message);
      cdApplies = hasPermission(config, cdPermission);
    }

    if (cdApplies && context.pluginData.cooldowns.isOnCooldown(cdKey)) {
      // We're on cooldown
      return false;
    }

    context.pluginData.cooldowns.setCooldown(cdKey, cdValue);
  }

  return true;
}

/**
 * Command post-filter to wait for and trigger any locks the command has, and to
 * interrupt command execution if the lock gets interrupted before it
 */
export async function checkCommandLocks(cmd: PluginCommandDefinition, context: CommandContext<any>): Promise<boolean> {
  if (!cmd.config.extra?.blueprint.locks) {
    return true;
  }

  const lock = (cmd.config.extra._lock = await context.pluginData.locks.acquire(cmd.config.extra.blueprint.locks));
  return !lock.interrupted;
}