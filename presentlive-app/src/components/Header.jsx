import { Group, Title, ActionIcon, Modal, Text } from "@mantine/core";
import { IconQuestionMark } from "@tabler/icons-react";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";

/**
 * Header component for ONLY presenter mode
 *
 * Header - present on top of the page for both Homepage and HostEdit.
 * Displays website name (can be used for navigation),
 * and a dynamic help modal based on the current page.
 *
 * A dedicated guide button for new presenters,
 * along with specific support content for the Home page and HostEdit.
 *
 * @component
 * @returns {JSX.Element} A top banner with website's name and guide
 */

function Header() {
  const [helpOpen, setHelpOpen] = useState(false);
  const location = useLocation();
  const isHostEdit = location.pathname.startsWith("/edit/");
  const modalContent = isHostEdit
    ? {
        title: "❓ How to start editing",
        description: `- Fill in all the required fields.\n 
        - A "Draft" status means the presentation is incomplete, and viewers will not be able to see the content when accessing the link. 
        Simply change the status to "Published" before sharing the link with viewers. \n
        - Start adding slides to the presentation by selecting "Add slide". \n
        - Poll responses will appear in the "Attendees" section; you can view an AI-generated summary of the results.`,
      }
    : {
        title: "❓ How to start with PresentLive",
        description: `- Add a new presentation by selecting "New Presentation" \n
          - Edit an existing presentation by clicking on it`,
      };

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
            {modalContent.title}
          </Text>
        }
        centered
      >
        <Text style={{ whiteSpace: "pre-line" }}>
          {modalContent.description}
        </Text>
      </Modal>
    </>
  );
}

export default Header;
