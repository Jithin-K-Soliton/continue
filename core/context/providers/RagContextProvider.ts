import { BaseContextProvider } from "../";
import {
  ContextItem,
  ContextProviderDescription,
  ContextProviderExtras,
} from "../../index.js";

class RagContextProvider extends BaseContextProvider {
  static description: ContextProviderDescription = {
    title: "qdrant",
    displayTitle: "Qdrant-RAG",
    description:
      "Retrieve context via a RAG pipeline using Qdrant vector search.",
    type: "normal",
  };

  private isInitialized: boolean = false;
  private url: string = "";
  private apiKey: string = "";
  private collectionName: string = "";
  private qdrantClient: any = null; // Add client property

  // Initialize configuration
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      this.url = this.options.url || "http://localhost:6333";
      this.apiKey = this.options.api_key || "";
      this.collectionName = this.options.collection || "default_collection";
            
      // Initialize QdrantClient similar to the first code
      try {
        // Import dynamically to maintain compatibility
        const { QdrantClient } = require("@qdrant/js-client-rest");
        this.qdrantClient = new QdrantClient({
          url: this.url,
          apiKey: this.apiKey,
        });
      } catch (error) {
        console.error("Failed to initialize QdrantClient:", error);
      }
            
      this.isInitialized = true;
    }
  }
  
  async initialize(): Promise<void> {
    try {
      this.ensureInitialized();
      
      // Use client approach instead of fetch for better compatibility
      if (this.qdrantClient) {
        
          const collections = await this.qdrantClient.getCollections();
          const collectionExists = collections.collections.some(
            (collection: any) => collection.name === this.collectionName
          );

          if (!collectionExists && this.options.autoCreateCollection) {
            const vectorSize = this.options.vectorSize || 384;
            
            await this.qdrantClient.createCollection(this.collectionName, {
              vectors: {
                size: vectorSize,
                distance: "Cosine",
              }
            });
            
          }
      }
    } catch (error) {
      console.error("Error initializing Qdrant collection:", error);
    }
  }

  async getContextItems(
    query: string,
    extras: ContextProviderExtras,
  ): Promise<ContextItem[]> {
    try {
      
      // Initialize client if not already done
      this.ensureInitialized();

      // Use the full input text to generate an embedding.
      const fullInput = extras.fullInput || query;

      if (!extras.embeddingsProvider) {
        void extras.ide.showToast(
          "warning",
          "Set up an embeddings model to use this feature. Visit the docs to learn more: " +
          "https://docs.continue.dev/customize/model-roles/embeddings",
        );
        return [];
      }

      // Generate embedding using the extension's embedding provider
      const queryEmbedding = await extras.embeddingsProvider.embed([fullInput]);

      if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
        throw new Error("Invalid embedding returned by embeddingsProvider.");
      }

      
      // Use the client instead of fetch for search
      if (!this.qdrantClient) {
        throw new Error("QdrantClient not initialized");
      }
      
      // Query Qdrant using client API like in the first example
      const searchResult = await this.qdrantClient.search(this.collectionName, {
        vector: queryEmbedding[0],
        limit: this.options.limit || 5,
        with_payload: true,
      });
      
      const results = Array.isArray(searchResult) ? searchResult : [];

      if (results.length === 0) {
        return [
          {
            name: "qdrant-rag-context",
            description: "No relevant context found in Qdrant database",
            content: "No matching documents found for your query.",
          },
        ];
      }

      // Map results to context items
      const contextItems = results.map((result: any, index: number) => {
        const content = result.payload?.text || "";
        const source = result.payload?.source || "unknown";
        const score = result.score || 0;

        return {
          name: `qdrant-result-${index + 1}`,
          description: `Match from ${source} (similarity: ${score.toFixed(4)})`,
          content: content,
        };
      });

      // Also return a combined context item with the top results
      const topResults = results.slice(0, 3);
      const combinedContent = topResults
        .map((r: any, i: number) => `[${i + 1}] ${r.payload?.text || ""}`)
        .join("\n\n");

      return [
        {
          name: "qdrant-rag-context",
          description: "Context retrieved via Qdrant RAG pipeline",
          content: combinedContent,
        },
      ];
    } catch (error) {
      console.error("Error in RagContextProvider:", error);
      
      // Return an error context item so the user knows something went wrong
      return [
        {
          name: "qdrant-rag-error",
          description: "Error retrieving context from Qdrant",
          content: `Failed to retrieve context: ${error instanceof Error ? error.message : String(error)}`,
        },
      ];
    }
  }
}

export default RagContextProvider;