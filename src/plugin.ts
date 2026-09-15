import streamDeck from "@elgato/streamdeck";

import { GenerateAction } from "./actions/generate-action";

streamDeck.logger.setLevel("info");
streamDeck.actions.registerAction(new GenerateAction());
streamDeck.connect();
