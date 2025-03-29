import { QdrantClient } from "@qdrant/js-client-rest";
import { BaseContextProvider } from "../";
import {
    ContextItem,
    ContextProviderDescription,
    ContextProviderExtras,
} from "../../index.js";


class RagContextProvider extends BaseContextProvider {
  static description: ContextProviderDescription = {
    title: "qdrant",
    displayTitle: "Qdrant RAG",
    description: "Retrieve context via a RAG pipeline using Qdrant vector search.",
    type: "query",
  };

  private qdrantClient: QdrantClient;

  constructor(options: any) {
    super(options);
    const url: string = this.options.url;
    const apiKey: string = this.options.api_key;
    this.qdrantClient = new QdrantClient({ url, apiKey });
  }

  async getContextItems(
    query: string,
    extras: ContextProviderExtras
  ): Promise<ContextItem[]> {
    try {
      // Use the full input text to generate an embedding.
      const fullInput = extras.fullInput;
      if (!extras.embeddingsProvider) {
          void extras.ide.showToast(
            "warning",
            "Set up an embeddings model to use this feature. Visit the docs to learn more: " +
              "https://docs.continue.dev/customize/model-roles/embeddings",
          );
          return [];
    }
      const queryEmbedding = await extras.embeddingsProvider.embed([fullInput]);

      if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
        throw new Error("Invalid embedding returned by embeddingsProvider.");
      }

      const collectionName: string = this.options.collection || "default_collection";

      // Query Qdrant for similar documents using the generated embedding.
      const searchResult = await this.qdrantClient.search(collectionName,{
        vector: queryEmbedding[0], // Use the first embedding vector.
        limit: 5, // Adjust the limit as needed.
      });

      // Extract candidate texts from the Qdrant search hits.
      const hits = Array.isArray(searchResult) ? searchResult : [];
      const candidateTexts: string[] = hits.map(
        (hit: any) => hit.payload?.text || ""
      );

      // Join the top 3 candidate snippets.
      const bestCandidates = candidateTexts.slice(0, 3).join("\n");

      return [
        {
          name: "qdrant-rag-context",
          description: "Context retrieved via Qdrant RAG pipeline",
          content: bestCandidates
        },
      ];
    } catch (error) {
      console.error("Error in RagContextProvider:", error);
      return [];
    }
  }
}

export default RagContextProvider;