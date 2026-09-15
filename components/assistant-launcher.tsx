'use client';

import { useState } from 'react';
import { Show } from '@clerk/nextjs';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AssistantChat } from '@/components/assistant-chat';

export function AssistantLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <Show when="signed-in">
      <Button
        variant="default"
        size="icon-lg"
        className="fixed bottom-5 right-5 z-40 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
        aria-label="Open travel assistant"
      >
        <MessageCircle />
      </Button>
      <AssistantChat open={open} onOpenChange={setOpen} />
    </Show>
  );
}
