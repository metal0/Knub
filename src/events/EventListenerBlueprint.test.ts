import { typedGlobalEventListener, typedGuildEventListener } from "./EventListenerBlueprint";
import { BasePluginType } from "../plugins/pluginTypes";
import { expect } from "chai";
import { GuildMessage } from "../types";
import { Channel, DMChannel, GuildChannel, Message } from "discord.js";

type AssertEquals<TActual, TExpected> = TActual extends TExpected ? true : false;

describe("typedGuildEventListener() helper", () => {
  it("(blueprint)", () => {
    const blueprint1 = typedGuildEventListener({
      event: "message",
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      listener() {},
    });

    expect(blueprint1.event).to.equal("message");
    expect(blueprint1.listener).to.not.equal(undefined);
    expect(blueprint1.allowSelf).to.equal(undefined);
  });

  it("(blueprint) guild event argument inference", () => {
    typedGuildEventListener({
      event: "message",
      listener({ args }) {
        // Test type inference
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const result: AssertEquals<typeof args, { message: GuildMessage }> = true;
      },
    });

    // More type checks
    typedGuildEventListener({
      event: "channelUpdate",
      listener({ args }) {
        // Test type inference
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const result: AssertEquals<typeof args, { oldChannel: GuildChannel; newChannel: GuildChannel }> = true;
      },
    });

    typedGuildEventListener({
      event: "typingStart",
      listener({ args }) {
        // Test type inference
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const result: AssertEquals<typeof args, { channel: GuildChannel }> = true;
      },
    });
  });

  interface CustomPluginType extends BasePluginType {
    config: {
      foo: 5;
    };
  }

  it("<TPluginType>()(blueprint)", () => {
    const blueprint = typedGuildEventListener<CustomPluginType>()({
      event: "message",
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      listener() {},
    });

    expect(blueprint.event).to.equal("message");
    expect(blueprint.listener).to.not.equal(undefined);
    expect(blueprint.allowSelf).to.equal(undefined);
  });
});

describe("typedGlobalEventListener() helper", () => {
  it("(blueprint)", () => {
    const blueprint = typedGlobalEventListener({
      event: "message",
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      listener() {},
    });

    expect(blueprint.event).to.equal("message");
    expect(blueprint.listener).to.not.equal(undefined);
    expect(blueprint.allowSelf).to.equal(undefined);
  });

  it("(blueprint) guild event argument inference", () => {
    typedGlobalEventListener({
      event: "message",
      listener({ args }) {
        // Test type inference
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const result: AssertEquals<typeof args, { message: Message }> = true;
      },
    });

    // More type checks
    typedGlobalEventListener({
      event: "channelUpdate",
      listener({ args }) {
        // Test type inference
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const result: AssertEquals<typeof args, { oldChannel: Channel; newChannel: Channel }> = true;
      },
    });

    typedGlobalEventListener({
      event: "typingStart",
      listener({ args }) {
        // Test type inference
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const result: AssertEquals<typeof args, { channel: Channel | DMChannel }> = true;
      },
    });
  });

  interface CustomPluginType extends BasePluginType {
    config: {
      foo: 5;
    };
  }

  it("<TPluginType>()(blueprint)", () => {
    const blueprint = typedGlobalEventListener<CustomPluginType>()({
      event: "message",
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      listener() {},
    });

    expect(blueprint.event).to.equal("message");
    expect(blueprint.listener).to.not.equal(undefined);
    expect(blueprint.allowSelf).to.equal(undefined);
  });
});
