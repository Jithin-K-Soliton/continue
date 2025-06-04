import { fetchwithRequestOptions } from "@continuedev/fetch";
import { v4 as uuidv4 } from "uuid";
import RagContextProvider from "../../context/providers/RagContextProvider.js";
import { ChatMessage, ContextItemId, SlashCommand } from "../../index.js";
import { renderChatMessage } from "../../util/messageContent.js";
import { Telemetry } from "../../util/posthog.js";



function getLastUserHistory(history: ChatMessage[]): string {
  const lastUserHistory = history
    .reverse()
    .find((message) => message.role === "user");

  if (!lastUserHistory) {
    return "";
  }

  if (Array.isArray(lastUserHistory.content)) {
    return lastUserHistory.content.reduce(
      (acc: string, current: { type: string; text?: string }) => {
        return current.type === "text" && current.text
          ? acc + current.text
          : acc;
      },
      "",
    );
  }

  return typeof lastUserHistory.content === "string"
    ? lastUserHistory.content
    : "";
}

const GenerateFirmwareCodeCommand: SlashCommand = {
  name: "generateFirmwareCode",
  description: "Generate firmware code",
  run: async function* (sdk) {
    if (sdk.input.trim() === "") {
      yield "Please provide a description of the shell command you want to generate. For example, '/cmd List all files in the current directory'.";
      return;
    }

    const reviewText = getLastUserHistory(sdk.history).replace("\\generateFirmwareCode", "");

    const provider =
            sdk.config.contextProviders?.find(
              (provider) => provider.description.title === "qdrant",
            ) ??
            [
              new RagContextProvider({}),
            ].find((provider) => provider.description.title === "qdrant");
          if (!provider) {
            return [];
          }
  
    const id: ContextItemId = {
              providerTitle: provider.description.title,
              itemId: uuidv4(),
            };
    const config = sdk.config;
    const llm = sdk.llm;
    const ide = sdk.ide;
    const selectedCode = sdk.selectedCode;
    const fullInput = sdk.input;
    
    const items = await provider.getContextItems(sdk.input, {
      config,
      llm,
      embeddingsProvider: config.selectedModelByRole.embed,
      fullInput,
      ide,
      selectedCode,
      reranker: config.selectedModelByRole.rerank,
      fetch: (url, init) =>
        fetchwithRequestOptions(url, init, config.requestOptions),
    });

    void Telemetry.capture(
      "useContextProvider",
      {
        name: provider.description.title,
      },
      true,
    );

    const contextItems = items.map((item) => ({
      ...item,
      id,
    }));
        
    for (const item of contextItems) {
      sdk.addContextItem(item);
    }



    const prompt = `
You are a firmware engineering expert with deep knowledge of embedded systems programming.
Your task is to generate clean, efficient, and well-documented firmware code based on the context provided.
Always include the language and file name in the info string when you write code blocks. If you are editing "src/main.py" for example, your code block should start with '\`\`\`python src/main.py'. If you are not editing an existing file then you should give a name to the file on your own and use the default folder structure for example, if you're creating a python code your code block should start with '\`\`\`python src/<file-name>.py'.

Also you have to follow a standard response structure. Your response should be in the following format:
Start with small introduction with 2 to 3 lines.
Start with the code block.
Explain the code in points.
Each point should be small and consise.

USER QUERY:
${sdk.input}

Based on this information, please generate firmware code that:
1. Is optimized for embedded systems with limited resources
2. Follows best practices for memory management
3. Includes clear comments and documentation
4. Uses appropriate error handling
5. Is modular and maintainable

Provide the code with explanations of key components and design decisions. If there are multiple ways to implement the solution, explain the pros and cons of each approach.`;

    // Yield the result from the API
    // for await (const chunk of llm.streamChat(
    //   [{ role: "user", content: prompt }],
    //   new AbortController().signal,
    // )) {
    //   yield renderChatMessage(chunk);
    // }

    const gen = llm.streamChat(
      [{ role: "user", content: prompt }],
      new AbortController().signal,
    )


    let next = await gen.next();
    while (!next.done) {
      const chunk = next.value;
      console.log(chunk.content);
      yield renderChatMessage(chunk);
      next = await gen.next();
    }
  },
};

export default GenerateFirmwareCodeCommand;