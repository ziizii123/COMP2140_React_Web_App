import {
  Box,
  Title,
  SimpleGrid,
  Card,
  Text,
  Stack,
  Center,
  Loader,
  ActionIcon,
  Button,
  Modal,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useNavigate, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { apiGet, apiPost, apiDelete } from "../api";

/**
 * Homepage
 *
 * Homepage - displays every Presentation the presenter owns as a card grid,
 * with actions to create a new one, open one for editing, or delete one.
 * Shows a blocking welcome modal on first use, when
 * no presentations exist yet.
 *
 * @component
 * @returns {JSX.Element} The presentation list page
 */

function Home() {
  const [presentations, setPresentations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadPresentations();
  }, []);

  function loadPresentations() {
    setLoading(true);
    apiGet("/presentations")
      .then((data) => setPresentations(data))
      .catch(() =>
        setError("Failed to load presentations. Please try again later."),
      )
      .finally(() => setLoading(false));
  }

  async function handleCreateNew() {
    try {
      const newPresentation = await apiPost("/presentations", {
        title: "Untitled Presentation",
        description: "",
        presenter_name: "",
        status: "Draft",
      });
      navigate(`/edit/${newPresentation.id}`);
    } catch (error) {
      console.error(error);
      setError("Failed to create new presentation. Please try again later.");
      loadPresentations();
    }
  }

  async function handleDelete(e, id) {
    e.preventDefault();
    e.stopPropagation();
    if (
      !confirm(
        "Are you sure you want to delete this presentation? This cannot be undone.",
      )
    )
      return;

    try {
      await apiDelete(`/presentations/${id}`);
      setPresentations((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setError("Failed to delete presentation. Please try again later.");
    }
  }

  if (loading)
    return (
      <Center h={200}>
        <Loader />
      </Center>
    );

  return (
    <>
      {/* Guide new presenters on how to start using the website, and direct them to HostEdit page. */}
      <Modal
        opened={!loading && !error && presentations.length === 0}
        onClose={() => {}}
        withCloseButton={false}
        closeOnClickOutside={false}
        closeOnEscape={false}
        centered
        title={
          <Text fw={700} size="xl">
            ✨ Welcome to PresentLive
          </Text>
        }
      >
        <Text mb="md">Please create a new presentation to begin.</Text>
        <Button onClick={handleCreateNew} fullWidth>
          + New Presentation
        </Button>
      </Modal>

      {/* Display presentations as a grid of cards. */}
      <Box w="100%" px="xl" py="xl" style={{ flex: 1 }}>
        <Title order={2} mb="lg" mx="xl" c="#000" ta="left">
          My Presentation
        </Title>

        {error && (
          <Text c="red" ta="center" mb="lg">
            {error}
          </Text>
        )}

        {!error && presentations.length === 0 && (
          <Text c="dimmed" ta="center" mb="lg">
            No presentations found. Click "New Presentation" to create one.
          </Text>
        )}

        <SimpleGrid cols={3} spacing="lg">
          <Card
            onClick={handleCreateNew}
            shadow="md"
            padding="xl"
            radius="md"
            withBorder
            className="card-hover-effect"
            style={{
              textDecoration: "none",
              minHeight: 220,
              cursor: "pointer",
            }}
          >
            <Center h="100%">
              <Stack align="center" gap="xs">
                <IconPlus size={40} stroke={1.5} color="orange" />
                <Text fw={600} c="black">
                  New Presentation
                </Text>
              </Stack>
            </Center>
          </Card>

          {/* Render existing presentations. */}
          {presentations.map((presentation) => (
            <Card
              key={presentation.id}
              component={Link}
              to={`/edit/${presentation.id}`}
              shadow="sm"
              padding="lg"
              radius="md"
              withBorder
              className="card-hover-effect"
              style={{ textDecoration: "none", minHeight: 220 }}
            >
              <ActionIcon
                variant="subtle"
                color="red"
                style={{ position: "absolute", bottom: 15, right: 20 }}
                onClick={(e) => handleDelete(e, presentation.id)}
              >
                <IconTrash size={16} />
              </ActionIcon>

              <Stack justify="space-between" h="100%">
                <div>
                  <Text fw={600} c="black" size="lg" ta="center">
                    {presentation.title}
                  </Text>
                  <Text size="sm" c="dimmed" ta="center">
                    {presentation.presenter_name}
                  </Text>
                </div>
                <Text
                  size="xs"
                  c={presentation.status === "Published" ? "green" : "orange"}
                >
                  {presentation.status}
                </Text>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      </Box>
    </>
  );
}

export default Home;
