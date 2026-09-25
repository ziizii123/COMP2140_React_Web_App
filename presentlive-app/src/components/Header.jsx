import { Group, Title, ActionIcon, Modal, Text } from "@mantine/core";
import { IconQuestionMark } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useState } from "react";

/**
 * Header component for ONLY presenter mode
 *
 * Header - present on top of the page for both Homepage and HostEdit,
 * having a large title help presenter redirect
 *
 * @component
 * @returns {JSX.Element} The presentation list page
 */

function Header() {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <>
      <Group justify="space-between" px="xl" py="sm" bg="dark.8">
        <Title order={1} c="white" fw={700}>
          <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
            PresentLive
          </Link>
        </Title>
        <ActionIcon
          variant="filled"
          radius="xl"
          size="lg"
          className="question-btn"
          aria-label="Help"
          onClick={() => setHelpOpen(true)}
        >
          <IconQuestionMark className="question-icon" />
        </ActionIcon>
      </Group>
      <Modal
        opened={helpOpen}
        onClose={() => setHelpOpen(false)}
        title={
          <Text size="lg" fw={700}>
            How to start with PresentLive
          </Text>
        }
        centered
      >
        <Text style={{ whiteSpace: "pre-line" }}>
          {`- Add a new presentation by selecting "New Presentation" \n
          - Edit an existing presentation by clicking on it`}
        </Text>
      </Modal>
    </>
  );
}

export default Header;
