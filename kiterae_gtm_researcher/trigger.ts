import 'dotenv/config';
import { TaskClient, decodeInlineArtifact } from '@blocks-network/sdk';
import type { ArtifactEvent } from '@blocks-network/sdk';

async function main() {
  const client = await TaskClient.create({
    billingMode: 'free',
    apiKey: process.env.BLOCKS_API_KEY!,
  });

  console.log('[trigger] Sending task...');

  const session = await client.sendMessage({
    agentName: 'kiterae_gtm_researcher',
    requestParts: [{ partId: 'request', text: JSON.stringify({ topic: 'AI-powered legal contract review for SMBs' }) }],
  });

  console.log('[trigger] Task created:', session.taskId);

  session.onProgress((event) => {
    console.log('[progress]', event.message ?? String(event.progress ?? ''));
  });

  session.onError((err) => {
    console.error('[error]', err);
  });

  session.onArtifact(async (event: ArtifactEvent) => {
    const ref = event.artifactRef;
    console.log('[artifact] outputId:', ref.outputId, '| mimeType:', ref.mimeType);
    try {
      if (ref.kind === 'inline' && ref.data) {
        const bytes = decodeInlineArtifact(ref);
        const text = new TextDecoder().decode(bytes);
        console.log('[artifact content preview]', text.slice(0, 300));
      } else {
        const downloaded = await session.downloadArtifact(ref);
        const text = new TextDecoder().decode(downloaded.data);
        console.log('[artifact content preview]', text.slice(0, 300));
      }
    } catch (e) {
      console.error('[artifact download error]', e);
    }
  });

  console.log('[trigger] Waiting up to 5 minutes for task to complete...');
  try {
    const terminal = await session.waitForTerminal(300_000);
    console.log('[done] Terminal state:', terminal.state, '| reason:', terminal.reason ?? 'none');
  } catch (e) {
    console.error('[timeout/error] Task did not complete in time:', e);
  } finally {
    await session.asyncClose();
    client.destroy();
  }
}

main().catch(console.error);
